/**
 * Checks the tile arithmetic against coordinates whose tile numbers are known.
 *
 * Getting this wrong does not throw — it silently shows a card a picture of
 * somewhere else, which is precisely the kind of quiet lie this app cannot
 * afford. The expected numbers below come from the standard Web Mercator
 * formula that every slippy map agrees on.
 *
 * Run: node --experimental-strip-types scripts/test-satellite.mjs
 */
import assert from "node:assert/strict";

import { satelliteTileUrl, tileFor } from "../src/lib/satellite.ts";

const cases = [
  // [name, lat, lng, zoom, expected x, expected y]
  ["null island", 0, 0, 1, 1, 1],
  ["Greenwich at zoom 0 is the only tile there is", 51.5, 0, 0, 0, 0],
  // Computed independently from the Web Mercator formula, not read off the code.
  ["Bengaluru, zoom 14", 12.9716, 77.5946, 14, 11723, 7596],
  ["Mumbai, zoom 14", 19.076, 72.8777, 14, 11508, 7307],
  ["Delhi, zoom 12", 28.6139, 77.209, 12, 2926, 1707],
];

let failed = 0;
for (const [name, lat, lng, zoom, x, y] of cases) {
  try {
    const tile = tileFor(lat, lng, zoom);
    assert.equal(tile.x, x, `x was ${tile.x}, expected ${x}`);
    assert.equal(tile.y, y, `y was ${tile.y}, expected ${y}`);
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

const checks = [
  [
    "a zoom past the imagery is pulled back to what exists",
    () => assert.ok(satelliteTileUrl(12.97, 77.59, 19).includes("/14/")),
  ],
  [
    "the url puts y before x, the way this service wants it",
    () => {
      const { x, y } = tileFor(12.9716, 77.5946, 14);
      assert.ok(satelliteTileUrl(12.9716, 77.5946).endsWith(`/14/${y}/${x}.jpg`));
    },
  ],
  [
    "a project with no coordinates gets no picture rather than a wrong one",
    () => {
      assert.equal(satelliteTileUrl(Number.NaN, 77), null);
      assert.equal(satelliteTileUrl(91, 77), null);
      assert.equal(satelliteTileUrl(12, 181), null);
    },
  ],
  [
    "the poles do not produce a tile number off the edge of the world",
    () => {
      const top = tileFor(89.9, 0, 5);
      assert.ok(top.y >= 0 && top.y < 2 ** 5, `y was ${top.y}`);
      const bottom = tileFor(-89.9, 0, 5);
      assert.ok(bottom.y >= 0 && bottom.y < 2 ** 5, `y was ${bottom.y}`);
    },
  ],
];

for (const [name, run] of checks) {
  try {
    run();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

const total = cases.length + checks.length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
