import { useEffect, useMemo, useRef, useState } from "react";

import { WtfMark } from "@/components/wtf/logo";
import type { Project } from "@/lib/queries";
import { distanceKm } from "@/lib/wtf";

/**
 * The scan.
 *
 * This is the first thing anybody sees, and it exists to answer one question in
 * about three seconds: is there anything here about *my* street? A list with a
 * city dropdown makes you do the work of asking. A radar does the asking for you
 * and shows the answer arriving — each blip is a real project, placed at its real
 * bearing and distance from where you are, so by the time the sweep finishes you
 * have already seen that there are seven things near you and roughly where.
 *
 * It runs on data we already hold, so the wait is honest rather than a spinner
 * padding out a request that finished instantly.
 */

/** How long the sweep runs before handing over to the map. */
const SCAN_MS = 2600;
/** Never claim a tighter range than this, however close the nearest project is. */
const MIN_RANGE_KM = 25;
/** Inside this, "near you" is a fair description. Outside it, say the number. */
const NEARBY_KM = 100;
/** How many projects the dish tries to fit before it stops widening. */
const TARGET_BLIPS = 8;

type Blip = {
  id: string;
  /** Position inside the dish, 0-100 in each axis. */
  x: number;
  y: number;
  /** Fraction of the sweep at which this one is discovered. */
  at: number;
  distance: number;
};

function useBlips(
  projects: Project[],
  origin: { lat: number; lng: number },
): { blips: Blip[]; rangeKm: number } {
  return useMemo(() => {
    const located = projects
      .filter((project) => project.latitude != null && project.longitude != null)
      .map((project) => {
        const lat = project.latitude as number;
        const lng = project.longitude as number;
        return {
          id: project.id,
          distance: distanceKm(origin.lat, origin.lng, lat, lng),
          // True bearing, so the dish is a real picture of what is around you
          // and not a scatter of decorative dots.
          angle: Math.atan2(lng - origin.lng, lat - origin.lat),
        };
      })
      .sort((a, b) => a.distance - b.distance);

    // The dish scales to the data rather than to a number picked in advance.
    // A fixed range looks confident and then shows an empty circle to anybody
    // outside the handful of places already covered, which is most of India
    // today — so instead we widen until the nearest few projects fit and say
    // out loud how far we had to look.
    const reach = located[Math.min(TARGET_BLIPS, located.length) - 1]?.distance ?? MIN_RANGE_KM;
    const rangeKm = Math.max(Math.ceil((reach * 1.08) / 5) * 5, MIN_RANGE_KM);

    const blips = located
      .filter((item) => item.distance <= rangeKm)
      .map((item) => {
        const radius = (item.distance / rangeKm) * 46;
        return {
          id: item.id,
          x: 50 + Math.sin(item.angle) * radius,
          y: 50 - Math.cos(item.angle) * radius,
          distance: item.distance,
          // A blip lights up when the sweep line passes over it, so the reveal
          // reads as the beam finding things rather than dots on a timer.
          at: ((item.angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2),
        };
      });

    return { blips, rangeKm };
  }, [projects, origin.lat, origin.lng]);
}

export function Radar({
  projects,
  origin,
  placeLabel,
  approximate,
  onDone,
}: {
  projects: Project[];
  /** Null while the browser is still deciding where you are: the dish spins empty. */
  origin: { lat: number; lng: number } | null;
  /** Where we are scanning from, in words. */
  placeLabel: string;
  /** True when this is a stand-in city because location was declined. */
  approximate: boolean;
  onDone: () => void;
}) {
  const { blips, rangeKm } = useBlips(projects, origin ?? { lat: 0, lng: 0 });
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  const pending = origin == null;

  // Held in a ref so a re-render of the page around the radar cannot restart a
  // scan that is already half way through.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!pending) return;
    // Keep the beam turning while the permission prompt is on screen, so the wait
    // is the same object as the scan rather than a spinner in front of it.
    let frame = 0;
    const start = performance.now();
    const spin = (now: number) => {
      setProgress(((now - start) / SCAN_MS) % 0.5);
      frame = requestAnimationFrame(spin);
    };
    frame = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(frame);
  }, [pending]);

  useEffect(() => {
    if (pending) return;
    // Anybody who has asked their system not to animate gets the answer at once.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (still) {
      setProgress(1);
      const id = window.setTimeout(() => onDoneRef.current(), 400);
      return () => window.clearTimeout(id);
    }

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const value = Math.min((now - start) / SCAN_MS, 1);
      setProgress(value);
      if (value < 1) {
        frame = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        window.setTimeout(() => onDoneRef.current(), 550);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pending]);

  // Two full turns of the beam across the scan, so it never looks becalmed.
  const sweeps = progress * 2;
  const found = pending ? [] : blips.filter((blip) => sweeps >= blip.at || sweeps - 1 >= blip.at);
  const nearest = blips[0];
  const scanning = pending || progress < 1;
  const nearby = found.filter((blip) => blip.distance <= NEARBY_KM).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink px-6 text-ink-foreground">
      <WtfMark className="size-10" title="We the Future" />

      <h1 className="display-md mt-6 max-w-xs text-balance text-center">
        Finding what is being built near you
      </h1>

      <div
        className="relative mt-8 aspect-square w-full max-w-[19rem]"
        role="img"
        aria-label={`Scanning for government projects near ${placeLabel}`}
      >
        {/* Range rings. */}
        {[100, 74, 48, 22].map((size) => (
          <span
            key={size}
            aria-hidden
            className="absolute rounded-full border border-ink-line"
            style={{
              inset: `${(100 - size) / 2}%`,
              opacity: 0.55 + (100 - size) / 200,
            }}
          />
        ))}
        {!pending ? (
          <span
            aria-hidden
            className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-full bg-ink-line/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-muted"
          >
            {rangeKm} km
          </span>
        ) : null}
        <span aria-hidden className="absolute left-1/2 top-0 h-full w-px bg-ink-line/60" />
        <span aria-hidden className="absolute top-1/2 h-px w-full bg-ink-line/60" />

        {/* The beam. A conic gradient rotated by hand keeps it in step with the
            blips, which a CSS animation could not guarantee. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, transparent 285deg, color-mix(in oklch, var(--color-primary) 78%, transparent) 358deg, transparent 360deg)",
            transform: `rotate(${sweeps * 360}deg)`,
            opacity: scanning ? 1 : 0,
            transition: "opacity 400ms ease-out",
          }}
        />

        {/* You. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/25"
        />

        {blips.map((blip) => {
          const lit = found.includes(blip);
          return (
            <span
              key={blip.id}
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-status-delayed"
              style={{
                left: `${blip.x}%`,
                top: `${blip.y}%`,
                opacity: lit ? 1 : 0,
                transform: `translate(-50%, -50%) scale(${lit ? 1 : 0.2})`,
                transition: "opacity 500ms ease-out, transform 500ms ease-out",
                boxShadow: lit
                  ? "0 0 0 6px color-mix(in oklch, var(--status-delayed) 22%, transparent)"
                  : "none",
              }}
            />
          );
        })}
      </div>

      {/* What it says has to survive the honest case: today there are eight
          projects in the whole database, so for most of India the nearest one
          is hundreds of kilometres away. Claiming those are "near you" would be
          the first thing the app got wrong, so the distance is stated plainly
          and the count stops pretending. */}
      <p className="mt-8 min-h-7 text-center text-lg font-semibold" aria-live="polite">
        {pending
          ? "Finding you…"
          : scanning
            ? `Looking around ${placeLabel}…`
            : found.length === 0
              ? "Nothing tracked yet"
              : nearby > 0
                ? `${nearby} ${nearby === 1 ? "project" : "projects"} near ${placeLabel}`
                : `${found.length} ${found.length === 1 ? "project" : "projects"} found`}
      </p>

      <p className="mt-2 min-h-8 max-w-xs text-center text-xs leading-relaxed text-ink-muted">
        {scanning || !nearest
          ? ""
          : nearby > 0
            ? `Closest is ${nearest.distance < 1 ? "under a kilometre" : `${Math.round(nearest.distance)} km`} away`
            : `Nothing within ${NEARBY_KM} km of ${placeLabel} yet — the closest we track is ${Math.round(nearest.distance).toLocaleString("en-IN")} km away. More is being added.`}
      </p>

      {approximate ? (
        <p className="mt-6 max-w-xs text-center text-xs leading-relaxed text-ink-muted">
          Location is off, so we started you in {placeLabel}. You can change it any time.
        </p>
      ) : null}
    </div>
  );
}
