/**
 * A picture of the place a project is, taken from orbit.
 *
 * Most projects have nobody standing in front of them yet, and a feed of
 * typography alone gets tiring however well set. This is the honest way to put
 * a real image on a card: not a stock photograph of "a road", not a picture of
 * some other flyover, but the actual patch of ground at the actual coordinates
 * in the project's own record.
 *
 * It is labelled as satellite imagery everywhere it appears. A reader must
 * never mistake it for somebody's photograph of the work, because what it shows
 * is a place, not a state of progress — and the moment a reader does send a
 * photograph from the ground, that replaces it.
 *
 * Sentinel-2 cloudless, from the European Space Agency by way of EOX, CC BY 4.0.
 * No key, no quota, and it stops at zoom 14 — roughly a neighbourhood.
 */

const TILE = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g";

/** Attribution required by the licence, shown wherever a tile is. */
export const SATELLITE_CREDIT = "Sentinel-2 cloudless · EOX (CC BY 4.0)";

/** The most detail this imagery actually holds. */
const MAX_ZOOM = 14;

/** Web Mercator tile numbers for a coordinate, as Leaflet and every slippy map do it. */
export function tileFor(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const radians = (clampedLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n,
  );
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1), z: zoom };
}

/**
 * The URL of a single tile covering a coordinate.
 *
 * One tile rather than a stitched grid on purpose: it is one request, it is
 * cached by everybody else looking at the same city, and a card is a backdrop
 * rather than a map somebody is navigating.
 */
export function satelliteTileUrl(lat: number, lng: number, zoom = MAX_ZOOM): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const { x, y, z } = tileFor(lat, lng, Math.min(zoom, MAX_ZOOM));
  return `${TILE}/${z}/${y}/${x}.jpg`;
}
