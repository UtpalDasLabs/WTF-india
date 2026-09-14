// Checks that analytics actually reports what it should, without letting a
// single byte reach Google: the tag request is intercepted and answered with a
// stub, so every assertion is about what the app queued.
//
// Broken analytics is silent — the app works perfectly and the dashboard is
// simply empty or wrong — so this is worth running after anything that touches
// routing, the head, or src/lib/analytics.ts.
//
//   VITE_GA_MEASUREMENT_ID=G-TEST12345 npm run build:ios
//   node scripts/serve-bundle.mjs &
//   node scripts/check-analytics.mjs
//
// What it is looking for:
//
//   - exactly one request for the tag, carrying the configured id
//   - send_page_view off, Google Signals off, ad personalisation off
//   - a page_view for the first screen and for every route after it, each with
//     the path and title of the screen it is actually on, reported against the
//     public site rather than whatever local origin it was read from
//   - no second page_view for navigating to the screen you are already on
//   - reaction and follow events, with the toggle reporting on:false the second
//     time rather than on:true again
//   - nothing at all — no request, no queue — when Do Not Track is set
//
// Run it again with the id unset to confirm the shipped default is inert.
const ORIGIN = process.env.ORIGIN ?? "http://localhost:4176";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projects = Array.from({ length: 8 }, (_, i) => ({
  id: id(i),
  name: `Project ${i}`,
  plain_summary: "Sanctioned at Rs 26,405 crore.",
  details: null,
  department: "BMRCL",
  sector: null,
  state: "Karnataka",
  district: "Bengaluru",
  latitude: 12.97 + i * 0.01,
  longitude: 77.59,
  budget_inr: 264050000000,
  status: "delayed",
  start_date: null,
  planned_end_date: "2021-02-28",
  actual_end_date: null,
  verification_status: "verified",
  confidence: 0.9,
  last_verified_at: "2026-09-01T00:00:00Z",
  published: true,
  source_origin: "official",
  community_note: null,
  original_cost_inr: 130000000000,
  revised_cost_inr: 264050000000,
  original_end_date: null,
  revised_end_date: null,
  time_overrun_months: 67,
}));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM0MjL6DwACYgF/9pAfWwAAAABJRU5ErkJggg==",
  "base64",
);

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);

async function run({ dnt }) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    permissions: ["geolocation"],
    geolocation: { latitude: 12.9716, longitude: 77.5946 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    // Answer the RPCs too. Left to fall through they reach a network that is
    // not there, the mutation fails, and the optimistic state is rolled back —
    // which made a second tap look like a first one.
    if (url.includes("/rpc/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "true",
      });
    }
    const body = url.includes("/projects") ? projects : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "content-range": `0-${body.length}/${body.length}`,
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify(body),
    });
  });
  await context.route("**/auth/v1/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await context.route(/cartocdn|arcgisonline|openstreetmap|maps\.eox|sentinel/, (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: png }),
  );

  const tagRequests = [];
  await context.route(/googletagmanager\.com/, (route) => {
    tagRequests.push(route.request().url());
    // Stand in for gtag.js: real enough to prove the queue is drained.
    return route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: "window.__tagLoaded = true; window.__drained = (window.dataLayer || []).length;",
    });
  });

  const page = await context.newPage();
  await page.addInitScript((dnt) => {
    localStorage.setItem("wtf.onboarded", "3");
    localStorage.setItem("wtf.oath", "1");
    if (dnt) Object.defineProperty(navigator, "doNotTrack", { get: () => "1" });
    window.__seen = [];
  }, dnt);
  await page.goto(ORIGIN + "/", { waitUntil: "load" });
  await page.waitForTimeout(2500);

  const read = () =>
    page.evaluate(() =>
      (window.dataLayer ?? []).map((entry) =>
        Array.from(entry).map((v) => (v instanceof Date ? "<Date>" : v)),
      ),
    );

  const afterLoad = await read();
  // Navigate: News, then Map, then back to News (a repeat), then the same tab twice.
  for (const label of ["News", "Map", "News"]) {
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await page.waitForTimeout(900);
  }
  await page.getByRole("link", { name: "News", exact: true }).first().click();
  await page.waitForTimeout(900);
  // A reaction from the rail, then a follow, then the same face again to turn
  // it off: three events, and the last must report on:false rather than vanish.
  await page.getByRole("link", { name: "Feed", exact: true }).first().click();
  await page.waitForTimeout(1800);
  const face = page.getByRole("button", { name: /I can.t believe this/ }).first();
  console.log("faces found:", await face.count());
  if (await face.count()) {
    await face.click();
    await page.waitForTimeout(400);
    await face.click();
    await page.waitForTimeout(400);
  }
  const follow = page.getByRole("button", { name: /Follow this/ }).first();
  console.log("follow buttons found:", await follow.count());
  if (await follow.count()) {
    await follow.click();
    await page.waitForTimeout(400);
  }
  const afterNav = await read();
  const loaded = await page.evaluate(() => ({
    tagLoaded: window.__tagLoaded ?? false,
    drained: window.__drained ?? null,
  }));
  await context.close();
  return { afterLoad, afterNav, tagRequests, loaded };
}

const on = await run({ dnt: false });
console.log("=== tag requests ===", JSON.stringify(on.tagRequests));
console.log("=== queued after load ===");
for (const e of on.afterLoad) console.log("  ", JSON.stringify(e));
console.log("=== every event, in order ===");
for (const e of on.afterNav.filter((x) => x[0] === "event"))
  console.log(`   ${e[1]}`, JSON.stringify(e[2]));
console.log("tag loaded:", on.loaded.tagLoaded, "| queue length it drained:", on.loaded.drained);

const off = await run({ dnt: true });
console.log("\n=== with Do Not Track set ===");
console.log("tag requests:", off.tagRequests.length, "| dataLayer:", JSON.stringify(off.afterNav));
await browser.close();
