/**
 * Checks the EXIF reader against JPEGs assembled byte by byte.
 *
 * The parser walks a marker chain and chases offsets into a TIFF block, in two
 * byte orders, and every one of those steps is the kind of thing that is wrong
 * by four bytes and still returns a plausible number. A photograph placed on the
 * wrong road is worse than one with no location at all, so the arithmetic is
 * pinned here rather than trusted.
 *
 * Run: node --experimental-strip-types scripts/test-photo-exif.mjs
 */
import assert from "node:assert/strict";

import { readPhotoMeta } from "../src/lib/photo.ts";

const TYPE = { ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5 };

/**
 * Builds a JPEG whose only content is an EXIF block, in whichever byte order is
 * asked for. Values longer than four bytes are appended to a heap and referenced
 * by offset, exactly as a camera writes them.
 */
function buildJpeg({ little = true, entries = {}, gps = {}, exif = {} } = {}) {
  const heap = [];
  let heapLength = 0;

  // Offsets are relative to the start of the TIFF header, and the heap sits
  // after all three directories, whose sizes are known once the counts are.
  const ifdSize = (count) => 2 + count * 12 + 4;
  const ifd0Count =
    Object.keys(entries).length +
    (Object.keys(exif).length ? 1 : 0) +
    (Object.keys(gps).length ? 1 : 0);
  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(ifd0Count);
  const gpsAt = exifAt + (Object.keys(exif).length ? ifdSize(Object.keys(exif).length) : 0);
  const heapAt = gpsAt + (Object.keys(gps).length ? ifdSize(Object.keys(gps).length) : 0);

  function stash(bytes) {
    const at = heapAt + heapLength;
    heap.push(bytes);
    heapLength += bytes.length;
    return at;
  }

  function encode(type, value) {
    if (type === TYPE.ASCII) {
      const text = Buffer.from(`${value}\0`, "ascii");
      return { size: text.length, count: text.length, bytes: text };
    }
    if (type === TYPE.RATIONAL) {
      const parts = Array.isArray(value) ? value : [value];
      const bytes = Buffer.alloc(parts.length * 8);
      parts.forEach(([numerator, denominator], index) => {
        if (little) {
          bytes.writeUInt32LE(numerator, index * 8);
          bytes.writeUInt32LE(denominator, index * 8 + 4);
        } else {
          bytes.writeUInt32BE(numerator, index * 8);
          bytes.writeUInt32BE(denominator, index * 8 + 4);
        }
      });
      return { size: bytes.length, count: parts.length, bytes };
    }
    if (type === TYPE.SHORT) {
      const bytes = Buffer.alloc(2);
      if (little) bytes.writeUInt16LE(value);
      else bytes.writeUInt16BE(value);
      return { size: 2, count: 1, bytes };
    }
    const bytes = Buffer.alloc(4);
    if (little) bytes.writeUInt32LE(value);
    else bytes.writeUInt32BE(value);
    return { size: 4, count: 1, bytes };
  }

  function writeIfd(fields) {
    const body = Buffer.alloc(ifdSize(fields.length));
    let cursor = 0;
    const put16 = (v) => {
      if (little) body.writeUInt16LE(v, cursor);
      else body.writeUInt16BE(v, cursor);
      cursor += 2;
    };
    const put32 = (v) => {
      if (little) body.writeUInt32LE(v, cursor);
      else body.writeUInt32BE(v, cursor);
      cursor += 4;
    };

    put16(fields.length);
    for (const [tag, type, value] of fields) {
      const encoded = encode(type, value);
      put16(tag);
      put16(type);
      put32(encoded.count);
      if (encoded.size > 4) {
        put32(stash(encoded.bytes));
      } else {
        // Short values sit in the entry itself, padded out to four bytes.
        encoded.bytes.copy(body, cursor);
        cursor += 4;
      }
    }
    put32(0);
    return body;
  }

  const ifd0Fields = Object.entries(entries).map(([tag, [type, value]]) => [
    Number(tag),
    type,
    value,
  ]);
  if (Object.keys(exif).length) ifd0Fields.push([0x8769, TYPE.LONG, exifAt]);
  if (Object.keys(gps).length) ifd0Fields.push([0x8825, TYPE.LONG, gpsAt]);

  // The heap is filled in as the directories are written, so order matters.
  const ifd0 = writeIfd(ifd0Fields);
  const exifIfd = Object.keys(exif).length
    ? writeIfd(Object.entries(exif).map(([tag, [type, value]]) => [Number(tag), type, value]))
    : Buffer.alloc(0);
  const gpsIfd = Object.keys(gps).length
    ? writeIfd(Object.entries(gps).map(([tag, [type, value]]) => [Number(tag), type, value]))
    : Buffer.alloc(0);

  const header = Buffer.alloc(8);
  header.write(little ? "II" : "MM", 0, "ascii");
  if (little) {
    header.writeUInt16LE(0x002a, 2);
    header.writeUInt32LE(ifd0At, 4);
  } else {
    header.writeUInt16BE(0x002a, 2);
    header.writeUInt32BE(ifd0At, 4);
  }

  const tiff = Buffer.concat([header, ifd0, exifIfd, gpsIfd, ...heap]);
  const app1Body = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1Header = Buffer.alloc(4);
  app1Header.writeUInt16BE(0xffe1, 0);
  app1Header.writeUInt16BE(app1Body.length + 2, 2);

  return new Blob([Buffer.from([0xff, 0xd8]), app1Header, app1Body, Buffer.from([0xff, 0xd9])]);
}

const MUMBAI = {
  0x0001: [TYPE.ASCII, "N"],
  0x0002: [
    TYPE.RATIONAL,
    [
      [19, 1],
      [4, 1],
      [336, 10],
    ],
  ],
  0x0003: [TYPE.ASCII, "E"],
  0x0004: [
    TYPE.RATIONAL,
    [
      [72, 1],
      [52, 1],
      [3972, 100],
    ],
  ],
};

const tests = [];
const test = (name, run) => tests.push([name, run]);

test("reads a little-endian fix to four decimals", async () => {
  const meta = await readPhotoMeta(buildJpeg({ gps: MUMBAI }));
  assert.ok(meta.lat !== null && Math.abs(meta.lat - 19.076) < 1e-6, `lat was ${meta.lat}`);
  assert.ok(meta.lng !== null && Math.abs(meta.lng - 72.8777) < 1e-6, `lng was ${meta.lng}`);
});

test("reads the same fix written big-endian", async () => {
  const meta = await readPhotoMeta(buildJpeg({ little: false, gps: MUMBAI }));
  assert.ok(meta.lat !== null && Math.abs(meta.lat - 19.076) < 1e-6, `lat was ${meta.lat}`);
  assert.ok(meta.lng !== null && Math.abs(meta.lng - 72.8777) < 1e-6, `lng was ${meta.lng}`);
});

test("south and west come back negative", async () => {
  const meta = await readPhotoMeta(
    buildJpeg({
      gps: {
        ...MUMBAI,
        0x0001: [TYPE.ASCII, "S"],
        0x0003: [TYPE.ASCII, "W"],
      },
    }),
  );
  assert.ok(meta.lat < 0 && meta.lng < 0, `got ${meta.lat}, ${meta.lng}`);
});

test("turns the EXIF date into something Date understands", async () => {
  const meta = await readPhotoMeta(
    buildJpeg({ gps: MUMBAI, exif: { 0x9003: [TYPE.ASCII, "2026:04:19 07:31:02"] } }),
  );
  assert.ok(meta.takenAt, "no date read");
  assert.equal(new Date(meta.takenAt).getUTCFullYear(), 2026);
  assert.equal(new Date(meta.takenAt).getUTCMonth(), 3);
});

test("keeps the orientation flag so the re-encode can apply it", async () => {
  const meta = await readPhotoMeta(
    buildJpeg({ entries: { 0x0112: [TYPE.SHORT, 6] }, gps: MUMBAI }),
  );
  assert.equal(meta.orientation, 6);
});

test("a photo with no GPS reports no location rather than zero", async () => {
  const meta = await readPhotoMeta(buildJpeg({ entries: { 0x0112: [TYPE.SHORT, 1] } }));
  assert.equal(meta.lat, null);
  assert.equal(meta.lng, null);
  assert.equal(meta.orientation, 1);
});

test("a zero fix is treated as absent, not as a point off West Africa", async () => {
  const meta = await readPhotoMeta(
    buildJpeg({
      gps: {
        0x0001: [TYPE.ASCII, "N"],
        0x0002: [
          TYPE.RATIONAL,
          [
            [0, 1],
            [0, 1],
            [0, 1],
          ],
        ],
        0x0003: [TYPE.ASCII, "E"],
        0x0004: [
          TYPE.RATIONAL,
          [
            [0, 1],
            [0, 1],
            [0, 1],
          ],
        ],
      },
    }),
  );
  assert.equal(meta.lat, null);
  assert.equal(meta.lng, null);
});

test("a file that is not a JPEG comes back empty instead of throwing", async () => {
  const meta = await readPhotoMeta(new Blob([Buffer.from("not an image at all")]));
  assert.deepEqual(meta, { lat: null, lng: null, takenAt: null, orientation: 1 });
});

test("a truncated EXIF block comes back empty instead of throwing", async () => {
  const whole = Buffer.from(await buildJpeg({ gps: MUMBAI }).arrayBuffer());
  const meta = await readPhotoMeta(new Blob([whole.subarray(0, 20)]));
  assert.equal(meta.lat, null);
});

let failed = 0;
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
