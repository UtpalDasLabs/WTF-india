/**
 * Reading a photograph, and then forgetting what it told us.
 *
 * A phone photograph knows where it was taken, and that is the whole reason the
 * camera is the app's main action: you do not have to know a project's name to
 * report on it, you only have to be standing in front of it.
 *
 * It also knows more than a stranger on the internet should. So the location is
 * read once, in the browser, used to decide which project the photograph belongs
 * to, rounded to about a hundred metres, and then the file is re-encoded from a
 * canvas before it is uploaded — which drops every EXIF block there is, the GPS
 * fix and the camera serial number along with it. What reaches the server is
 * pixels and nothing else.
 */

export type PhotoMeta = {
  /** Degrees, positive north. Null when the photograph carries no fix. */
  lat: number | null;
  lng: number | null;
  /** When the shutter fired, as an ISO string. */
  takenAt: string | null;
  /** EXIF orientation 1–8, applied on re-encode because re-encoding drops it. */
  orientation: number;
};

const EMPTY: PhotoMeta = { lat: null, lng: null, takenAt: null, orientation: 1 };

/** Byte counts for the EXIF field types we care about. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

type Reader = {
  view: DataView;
  /** Where the TIFF header starts; every EXIF offset is relative to it. */
  base: number;
  little: boolean;
};

function readValue(reader: Reader, offset: number, type: number): number {
  const { view, little } = reader;
  switch (type) {
    case 1:
    case 7:
      return view.getUint8(offset);
    case 3:
      return view.getUint16(offset, little);
    case 4:
      return view.getUint32(offset, little);
    case 9:
      return view.getInt32(offset, little);
    case 5:
      return view.getUint32(offset, little) / (view.getUint32(offset + 4, little) || 1);
    case 10:
      return view.getInt32(offset, little) / (view.getInt32(offset + 4, little) || 1);
    default:
      return 0;
  }
}

function readAscii(reader: Reader, offset: number, count: number): string {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    const code = reader.view.getUint8(offset + index);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

type Entry = { type: number; count: number; offset: number };

/** Every tag in one IFD, with each value's absolute offset already resolved. */
function readIfd(reader: Reader, ifdOffset: number): Map<number, Entry> {
  const entries = new Map<number, Entry>();
  const { view, little, base } = reader;
  const start = base + ifdOffset;
  if (start + 2 > view.byteLength) return entries;

  const count = view.getUint16(start, little);
  for (let index = 0; index < count; index += 1) {
    const entry = start + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    const size = (TYPE_SIZE[type] ?? 0) * length;
    // Four bytes or fewer live in the entry itself; anything larger is a pointer.
    const offset = size > 4 ? base + view.getUint32(entry + 8, little) : entry + 8;
    if (offset >= 0 && offset + Math.min(size, 4) <= view.byteLength) {
      entries.set(tag, { type, count: length, offset });
    }
  }
  return entries;
}

/** Degrees, minutes, seconds as three rationals, plus the N/S/E/W that signs it. */
function coordinate(reader: Reader, value: Entry | undefined, ref: string): number | null {
  if (!value || value.count < 3 || value.type !== 5) return null;
  const degrees = readValue(reader, value.offset, 5);
  const minutes = readValue(reader, value.offset + 8, 5);
  const seconds = readValue(reader, value.offset + 16, 5);
  const decimal = degrees + minutes / 60 + seconds / 3600;
  if (!Number.isFinite(decimal)) return null;
  const negative = ref === "S" || ref === "W";
  return negative ? -decimal : decimal;
}

/** EXIF writes "2026:04:19 07:31:02", which Date cannot parse as it stands. */
function exifDate(raw: string): string | null {
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Pulls location, capture time and orientation out of a JPEG's EXIF block.
 *
 * Never throws: a photograph with no EXIF, a screenshot, a PNG, or a file that
 * has been through a messaging app that already stripped it all just comes back
 * empty, and the caller falls back to asking where you are.
 */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    // The EXIF block sits near the front; reading the first slice keeps a 12 MP
    // photograph off the main thread's memory.
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return EMPTY;

    // Walk the JPEG marker chain to the APP1 segment that holds EXIF.
    let cursor = 2;
    let base = -1;
    while (cursor + 4 <= view.byteLength) {
      if (view.getUint8(cursor) !== 0xff) break;
      const marker = view.getUint8(cursor + 1);
      // Start of scan: image data from here on, no more metadata.
      if (marker === 0xda) break;
      const length = view.getUint16(cursor + 2);
      if (length < 2) break;
      if (
        marker === 0xe1 &&
        readAscii({ view, base: 0, little: false }, cursor + 4, 4) === "Exif"
      ) {
        base = cursor + 10;
        break;
      }
      cursor += 2 + length;
    }
    if (base < 0 || base + 8 > view.byteLength) return EMPTY;

    const endian = view.getUint16(base);
    if (endian !== 0x4949 && endian !== 0x4d4d) return EMPTY;
    const reader: Reader = { view, base, little: endian === 0x4949 };
    if (view.getUint16(base + 2, reader.little) !== 0x002a) return EMPTY;

    const ifd0 = readIfd(reader, view.getUint32(base + 4, reader.little));

    const orientationEntry = ifd0.get(0x0112);
    const orientation = orientationEntry
      ? readValue(reader, orientationEntry.offset, orientationEntry.type)
      : 1;

    let takenAt: string | null = null;
    const exifPointer = ifd0.get(0x8769);
    if (exifPointer) {
      const exif = readIfd(reader, readValue(reader, exifPointer.offset, exifPointer.type));
      const original = exif.get(0x9003) ?? exif.get(0x9004);
      if (original && original.type === 2) {
        takenAt = exifDate(readAscii(reader, original.offset, original.count));
      }
    }
    if (!takenAt) {
      const stamp = ifd0.get(0x0132);
      if (stamp && stamp.type === 2)
        takenAt = exifDate(readAscii(reader, stamp.offset, stamp.count));
    }

    let lat: number | null = null;
    let lng: number | null = null;
    const gpsPointer = ifd0.get(0x8825);
    if (gpsPointer) {
      const gps = readIfd(reader, readValue(reader, gpsPointer.offset, gpsPointer.type));
      const latRef = gps.get(0x0001);
      const lngRef = gps.get(0x0003);
      lat = coordinate(
        reader,
        gps.get(0x0002),
        latRef ? readAscii(reader, latRef.offset, latRef.count) : "N",
      );
      lng = coordinate(
        reader,
        gps.get(0x0004),
        lngRef ? readAscii(reader, lngRef.offset, lngRef.count) : "E",
      );
      if (lat != null && (Math.abs(lat) > 90 || lat === 0)) lat = null;
      if (lng != null && (Math.abs(lng) > 180 || lng === 0)) lng = null;
    }

    return {
      lat,
      lng,
      takenAt,
      orientation: orientation >= 1 && orientation <= 8 ? orientation : 1,
    };
  } catch {
    // A photograph we cannot read the metadata of is still a photograph.
    return EMPTY;
  }
}

/** How wide the longest edge of an uploaded photograph is allowed to be. */
const MAX_EDGE = 1600;

/**
 * Re-encodes a photograph so that nothing but the pixels survives.
 *
 * Drawing to a canvas and reading it back is what actually removes the metadata
 * — there is no EXIF block on the other side of a canvas. The cost is that the
 * orientation flag goes with it, so it is applied to the drawing first;
 * otherwise half the photographs taken in portrait would arrive on their side.
 */
export async function stripAndResize(file: Blob, orientation = 1, quality = 0.82): Promise<Blob> {
  // Browsers differ on whether they have already rotated the bitmap for us, so
  // orientation is switched off here and applied below where it can be reasoned
  // about. Left to the default, a photograph would be rotated twice on Chrome
  // and once on older Safari.
  const bitmap = await createImageBitmap(file, { imageOrientation: "none" });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    // 5 to 8 are the quarter turns, which put the long edge the other way round.
    const turned = orientation >= 5 && orientation <= 8;

    const canvas = document.createElement("canvas");
    canvas.width = turned ? height : width;
    canvas.height = turned ? width : height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process the photo.");

    switch (orientation) {
      case 2:
        context.transform(-1, 0, 0, 1, width, 0);
        break;
      case 3:
        context.transform(-1, 0, 0, -1, width, height);
        break;
      case 4:
        context.transform(1, 0, 0, -1, 0, height);
        break;
      case 5:
        context.transform(0, 1, 1, 0, 0, 0);
        break;
      case 6:
        context.transform(0, 1, -1, 0, height, 0);
        break;
      case 7:
        context.transform(0, -1, -1, 0, height, width);
        break;
      case 8:
        context.transform(0, -1, 1, 0, 0, width);
        break;
      default:
        break;
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("This browser cannot process the photo.");
    return blob;
  } finally {
    bitmap.close?.();
  }
}
