// Measures what one swipe through the feed costs, and whether it gets worse the
// further you go.
//
// Run it the same way as check-phone-layout.mjs:
//
//   npm run build:ios
//   node scripts/serve-bundle.mjs &
//   node scripts/measure-feed-cost.mjs
//
// What it is guarding, and the numbers before each was fixed:
//
//   backdrop  Elements with a backdrop filter. Each one is a composited surface
//             that re-reads whatever is behind it on every frame of a scroll.
//             The rails and pills had 93 of them on a fresh feed and 453 after
//             forty swipes. Must stay at 0.
//   nodes     Nothing used to be unmounted, so the feed grew without limit:
//             780 nodes fresh, 3,376 after forty cards, and the jank grew with
//             it. Windowing holds it near 500 however far you scroll, so the
//             two readings below should be close to each other.
//
// A caveat worth keeping in mind: this runs in headless Chromium on a server,
// which renders in software. It is good at counting what exists and poor at
// telling you what a phone GPU will charge for it — so treat the counts as the
// result and the frame times as a smoke test.
const ORIGIN = process.env.ORIGIN ?? "http://localhost:4176";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projects = Array.from({ length: 60 }, (_, i) => ({
  id: id(i),
  name: `Project ${i} — a long-ish government project name`,
  plain_summary: "Sanctioned at Rs 26,405 crore in Bengaluru.",
  details: null,
  department: "BMRCL",
  sector: null,
  state: "Karnataka",
  district: "Bengaluru",
  latitude: 12.97 + (i % 8) * 0.01,
  longitude: 77.59 + (i % 5) * 0.01,
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
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  permissions: ["geolocation"],
  geolocation: { latitude: 12.9716, longitude: 77.5946 },
  isMobile: true,
  hasTouch: true,
});
await context.route("**/rest/v1/**", (route) => {
  const url = route.request().url();
  if (url.includes("/rpc/")) return route.fallback();
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
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.addInitScript(() => {
  localStorage.setItem("wtf.onboarded", "3");
  localStorage.setItem("wtf.oath", "1");
});
await page.goto(ORIGIN, { waitUntil: "load" });
await page.waitForTimeout(3500);

const shape = () =>
  page.evaluate(() => {
    let backdrop = 0;
    for (const el of document.querySelectorAll("*"))
      if (getComputedStyle(el).backdropFilter !== "none") backdrop++;
    return {
      cards: document.querySelectorAll("ul[aria-label] > *").length,
      nodes: document.querySelectorAll("*").length,
      images: document.images.length,
      backdrop,
    };
  });

const swipe = (from, to) =>
  page.evaluate(
    async ([from, to]) => {
      const list = document.querySelector("ul[aria-label]");
      const gaps = [];
      let last = performance.now();
      let running = true;
      const tick = () => {
        const n = performance.now();
        gaps.push(n - last);
        last = n;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let i = from; i <= to; i++) {
        list.scrollTo({ top: i * list.clientHeight, behavior: "smooth" });
        await new Promise((r) => setTimeout(r, 650));
      }
      running = false;
      const sorted = [...gaps].sort((a, b) => a - b);
      return {
        median: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(1),
        p95: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1),
        janky: gaps.filter((g) => g > 32).length,
        frames: gaps.length,
      };
    },
    [from, to],
  );

console.log("fresh          ", JSON.stringify(await shape()));
console.log("  swipe 1-6    ", JSON.stringify(await swipe(1, 6)));
// Go deep: past the pagination boundary several times.
for (let i = 7; i <= 40; i++) {
  await page.evaluate((i) => {
    const l = document.querySelector("ul[aria-label]");
    l.scrollTop = i * l.clientHeight;
    l.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, i);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
console.log("after 40 cards ", JSON.stringify(await shape()));
console.log("  swipe 41-46  ", JSON.stringify(await swipe(41, 46)));
await browser.close();
