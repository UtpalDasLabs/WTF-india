// Looks at the built app at real phone sizes and reports anything that collides.
//
// Not part of `npm test`: it needs Playwright and a served bundle, neither of
// which the CI job has. Run it by hand after a layout change —
//
//   npm run build:ios
//   node scripts/serve-bundle.mjs &            # serves ios/App/App/public on 4176
//   SCRATCH=/tmp/shots node scripts/check-phone-layout.mjs
//
// It writes a screenshot of every page at every size into SCRATCH and exits
// non-zero if anything collided.
//
// Why it exists: the notch and the home indicator are the two things that break
// a phone layout and the two things a desktop browser will not show you.
// Chromium resolves env(safe-area-inset-*) to 0, so the insets are substituted
// in — every rule that mentions one is re-declared with the pixel value put in
// place of the env() token, leaving the surrounding calc() or max() intact and
// letting the later rule win on origin.
//
// Substituting inside the expression rather than overriding the whole
// declaration matters: an override turns calc(5rem + inset) into inset, which
// silently undoes the very padding being tested.
//
// It found three real faults the first time it ran — the radius pill landing on
// the card's meta row, the last line of every page sitting under a bottom bar
// grown by the home indicator, and the header under the clock — so it is worth
// running before believing a phone layout works.
// Playwright is not a dependency of this project on purpose: it is a large
// install and every CI job here runs `npm install`, which would cost minutes on
// three workflows to serve one script nobody runs in CI. Install it wherever
// suits and point PLAYWRIGHT_MODULE at it, or `npm i -D playwright` and let the
// bare specifier resolve.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const OUT = process.env.SCRATCH ?? ".";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:4176";
const ME = { latitude: 12.9716, longitude: 77.5946 };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projects = [
  ["Bangalore Metro Rail Project PHASE-2", 12.975, 77.6],
  ["Peripheral Ring Road, eastern alignment", 13.02, 77.66],
  ["Hebbal flyover widening and service road package 3B", 13.035, 77.591],
  ["K-100 Citizens Waterway stormwater drain rejuvenation", 12.965, 77.6],
].map(([name, latitude, longitude], i) => ({
  id: id(i),
  name,
  plain_summary:
    "Sanctioned at Rs 26,405 crore in Bengaluru. Promised by Feb 2021, now expected Mar 2025.",
  details: null,
  department: "BMRCL",
  sector: null,
  state: "Karnataka",
  district: "Bengaluru",
  latitude,
  longitude,
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
const posts = [
  {
    id: "aaaa1111-1111-4111-8111-111111111111",
    project_id: id(1),
    kind: "comment",
    body: "Barricades up for two years on this stretch. Nothing moving behind them.",
    photo_path: null,
    latitude: 13.02,
    longitude: 77.66,
    taken_at: null,
    created_at: new Date(Date.now() - 5 * 3600e3).toISOString(),
    flag_count: 0,
    handle: "Restless Kingfisher 233",
  },
];
const news = [
  {
    id: "bbbb1111-1111-4111-8111-111111111111",
    title:
      "Bengaluru civic body spent Rs 1,400 crore on roads that were relaid within a year, audit finds",
    url: "https://example.gov.in/report",
    publisher: "The Hindu",
    published_at: new Date(Date.now() - 9 * 3600e3).toISOString(),
    place_name: "Bengaluru",
    state: "Karnataka",
    latitude: 12.9716,
    longitude: 77.5946,
    scope: "city",
  },
];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM0MjL6DwACYgF/9pAfWwAAAABJRU5ErkJggg==",
  "base64",
);

// Top inset, bottom inset. iPhone SE has neither: no notch, a home button.
const PHONES = [
  // No insets at all: the shapes these same rules resolve to on Android, so a
  // change made for the notch cannot quietly move the Android layout.
  ["android-pixel-412x915", 412, 915, 0, 0],
  ["android-small-360x640", 360, 640, 0, 0],
  ["iphone-se-375x667", 375, 667, 20, 0],
  ["iphone-15-393x852", 393, 852, 59, 34],
  ["iphone-15-pro-max-430x932", 430, 932, 62, 34],
];

function simulateInsets([top, bottom]) {
  const substitute = (value) =>
    value
      .replace(/env\(\s*safe-area-inset-top\s*(?:,[^)]*)?\)/g, `${top}px`)
      .replace(/env\(\s*safe-area-inset-bottom\s*(?:,[^)]*)?\)/g, `${bottom}px`)
      .replace(/env\(\s*safe-area-inset-(?:left|right)\s*(?:,[^)]*)?\)/g, "0px");

  const rewritten = [];
  const walk = (rules) => {
    for (const rule of rules) {
      // CSS nesting gave every CSSStyleRule a .cssRules of its own, empty for a
      // flat rule — so "has cssRules" is true for all of them, and skipping on
      // it walked straight past every declaration in the sheet.
      if (rule.cssRules && rule.cssRules.length) {
        walk(rule.cssRules);
        continue;
      }
      if (!rule.selectorText) continue;
      // Read cssText rather than rule.style: Chrome treats an env() value the
      // way it treats a var() one and hands back an empty string for the
      // longhand, so enumerating the declaration finds nothing at all.
      const text = rule.cssText;
      if (!text || !text.includes("safe-area-inset")) continue;
      const open = text.indexOf("{");
      const close = text.lastIndexOf("}");
      if (open < 0 || close < open) continue;
      // Only the declarations are substituted. The selector carries the same
      // text, escaped, because that is how Tailwind names an arbitrary value.
      rewritten.push(text.slice(0, open + 1) + substitute(text.slice(open + 1, close)) + "}");
    }
  };
  const failures = [];
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch (error) {
      failures.push(String(error).slice(0, 80));
    }
  }
  const style = document.createElement("style");
  style.id = "simulated-safe-areas";
  style.textContent = rewritten.join("\n");
  document.head.appendChild(style);
  return { rules: rewritten.length, failures, sample: rewritten[0] ?? null };
}

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
let problems = 0;
let reportedSim = false;

for (const [label, width, height, insetTop, insetBottom] of PHONES) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 3,
    permissions: ["geolocation"],
    geolocation: ME,
    locale: "en-IN",
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await context.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("/rpc/")) return route.fallback();
    let body = [];
    if (url.includes("/project_posts_public")) body = posts;
    else if (url.includes("/news_items")) body = news;
    else if (url.includes("/projects")) body = projects;
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
  await context.route(/cartocdn|arcgisonline|openstreetmap|maps\.eox|tiles\.maps/, (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: png }),
  );

  const page = await context.newPage();
  page.on("pageerror", (e) => {
    problems++;
    console.log("  PAGE ERROR:", e.message.slice(0, 140));
  });
  await page.addInitScript(() => {
    localStorage.setItem("wtf.onboarded", "3");
    localStorage.setItem("wtf.oath", "1");
  });

  console.log(`\n== ${label} (inset top ${insetTop}, bottom ${insetBottom}) ==`);

  for (const [name, path] of [
    ["feed", "/"],
    ["news", "/news"],
    ["discover", "/discover"],
    ["auth", "/auth"],
    ["constitution", "/constitution"],
  ]) {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
    // After load, so every stylesheet the page pulled in is readable.
    const sim = await page.evaluate(simulateInsets, [insetTop, insetBottom]);
    if (!sim.rules) {
      problems++;
      console.log(
        `  the inset simulation found nothing to rewrite ${JSON.stringify(sim.failures)}`,
      );
    } else if (!reportedSim) {
      reportedSim = true;
      console.log(`  simulating ${sim.rules} safe-area rules, e.g. ${sim.sample}`);
    }
    await page.waitForTimeout(name === "feed" ? 2200 : 1500);
    await page.screenshot({ path: `${OUT}/40-${label}-${name}.png` });

    const measure = ([top, countChrome]) => {
      const hasTextChild = (el) =>
        [...el.children].some((child) => child.textContent.trim().length > 0);
      const nodes = [...document.querySelectorAll("p,h1,h2,h3,span,a,button,li")].filter((el) => {
        const s = getComputedStyle(el);
        return (
          s.visibility !== "hidden" &&
          s.opacity !== "0" &&
          s.display !== "none" &&
          el.textContent.trim().length > 1 &&
          !hasTextChild(el)
        );
      });
      const pinnedAncestor = (el) => {
        for (let node = el; node; node = node.parentElement) {
          const position = getComputedStyle(node).position;
          if (position === "fixed" || position === "sticky") return true;
        }
        return false;
      };
      const entries = nodes.map((el) => ({
        el,
        rects: [...el.getClientRects()],
        pinned: pinnedAncestor(el),
      }));
      const overlaps = [];
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i],
            b = entries[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          // A fixed bar is meant to have content pass behind it; the question is
          // only whether that content can be scrolled clear of it, which is what
          // the second pass at the bottom of the page asks — and only of the
          // bottom bar. Nothing can be scrolled clear of a sticky header, so
          // content behind that one is never a finding at any scroll position.
          const pinned = a.pinned || b.pinned;
          if (pinned) {
            if (!countChrome) continue;
            const rects = [...(a.pinned ? a.rects : []), ...(b.pinned ? b.rects : [])];
            if (!rects.some((r) => r.top > innerHeight * 0.6)) continue;
          }
          for (const ra of a.rects)
            for (const rb of b.rects) {
              if (ra.width < 4 || ra.height < 4 || rb.width < 4 || rb.height < 4) continue;
              const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
              const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
              if (ox > 8 && oy > 8) {
                overlaps.push(
                  `"${a.el.textContent.trim().slice(0, 24)}" X "${b.el.textContent.trim().slice(0, 24)}" (${Math.round(ox)}x${Math.round(oy)}px)`,
                );
              }
            }
        }
      }
      // Anything readable drawn inside the status bar strip is under the clock.
      const underTheClock = [];
      for (const { el, rects } of entries) {
        for (const r of rects) {
          if (r.height > 4 && r.top < top - 2 && r.bottom > 0) {
            underTheClock.push(`"${el.textContent.trim().slice(0, 30)}" top=${Math.round(r.top)}`);
          }
        }
      }
      return {
        overlaps: [...new Set(overlaps)].slice(0, 8),
        underTheClock: [...new Set(underTheClock)].slice(0, 6),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    };

    // Twice: once at the top of the page, ignoring anything drawn behind the
    // fixed chrome, and once scrolled to the very bottom, where nothing may be
    // behind it any more because there is no scroll left to free it.
    const report = await page.evaluate(measure, [insetTop, false]);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const atBottom = await page.evaluate(measure, [insetTop, true]);
    report.overlaps = [...new Set([...report.overlaps, ...atBottom.overlaps])];

    const notes = [];
    if (report.overflow > 0) notes.push(`overflows horizontally by ${report.overflow}px`);
    report.overlaps.forEach((o) => notes.push(`overlap ${o}`));
    report.underTheClock.forEach((o) => notes.push(`under the status bar: ${o}`));
    problems += notes.length;
    console.log(`  ${path.padEnd(10)} ${notes.length ? "" : "clean"}`);
    notes.forEach((n) => console.log(`      ${n}`));
  }
  await context.close();
}
await browser.close();
console.log(`\n${problems === 0 ? "PASS" : `FAIL: ${problems} problems`}`);
process.exit(problems === 0 ? 0 : 1);
