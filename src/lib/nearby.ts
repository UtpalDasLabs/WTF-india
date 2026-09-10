import { distanceKm } from "@/lib/wtf";

/**
 * Working out what counts as "near you".
 *
 * A fixed radius is wrong in both directions in a country this size. Twenty-five
 * kilometres around Dadar is a hundred projects; twenty-five kilometres around
 * most of Arunachal Pradesh is none, and an empty first screen is the failure
 * this whole app keeps having to be rescued from. So the radius is not fixed: it
 * opens out until there is enough to look at, and whatever it lands on is stated
 * on screen rather than implied.
 */
const STEPS_KM = [25, 50, 100, 250, 500, 1000];

/** Below this there is not enough to swipe through, so the radius opens out. */
const ENOUGH = 8;

export type Nearby<T> = {
  items: Array<{ item: T; distance: number }>;
  /** The step that was selected. What the filter used. */
  radiusKm: number;
  /**
   * How far the furthest thing actually included really is.
   *
   * Not the same as `radiusKm`, and this is the one to put on screen. In a
   * district with three tracked projects the radius opens all the way out, and
   * saying "3 within 1,000 km" next to something 245 m down the road is a
   * sentence that is technically true and reads as a lie.
   */
  reachKm: number;
  /** True when even the widest step could not find `ENOUGH`. */
  sparse: boolean;
};

function reachOf(items: Array<{ distance: number }>): number {
  return items.length === 0 ? 0 : items[items.length - 1]!.distance;
}

/**
 * The closest `items` to a point, inside the smallest radius that holds enough
 * of them. Anything without coordinates is left out entirely rather than being
 * given a guessed position — the same rule the rest of the app follows.
 */
export function nearbyTo<T>(
  items: T[],
  here: { lat: number; lng: number },
  coordsOf: (item: T) => { lat: number; lng: number } | null,
  enough = ENOUGH,
): Nearby<T> {
  const measured: Array<{ item: T; distance: number }> = [];
  for (const item of items) {
    const coords = coordsOf(item);
    if (!coords) continue;
    measured.push({ item, distance: distanceKm(here.lat, here.lng, coords.lat, coords.lng) });
  }
  measured.sort((a, b) => a.distance - b.distance);

  for (const radiusKm of STEPS_KM) {
    const within = measured.filter((entry) => entry.distance <= radiusKm);
    if (within.length >= enough) {
      return { items: within, radiusKm, reachKm: reachOf(within), sparse: false };
    }
  }

  const widest = STEPS_KM[STEPS_KM.length - 1]!;
  const within = measured.filter((entry) => entry.distance <= widest);
  return { items: within, radiusKm: widest, reachKm: reachOf(within), sparse: true };
}

/** "800 m" reads better than "0.8 km" when you are standing next to the thing. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-IN")} km`;
}
