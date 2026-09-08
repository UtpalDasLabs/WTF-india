import { useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";

import { WtfMark } from "@/components/wtf/logo";
import { INDIAN_CITIES, type CityOption } from "@/lib/wtf";
import { cn } from "@/lib/utils";

/**
 * First run. One question, big targets, no account.
 *
 * The old first screen showed a hero, a search box, a location bar, five status
 * filters and a list all at once, which is a lot to parse before you know what
 * the thing is. This asks the only question that changes what you see — where
 * you live — and then gets out of the way. Nothing here needs the network, so
 * it works before any data loads.
 */

// A handful of large cities as one-tap answers; everything else is one tap more.
const QUICK_CITIES = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Chennai",
  "Kolkata",
  "Hyderabad",
  "Pune",
  "Ahmedabad",
];

export function Welcome({
  onPickCity,
  onUseLocation,
  onSkip,
}: {
  onPickCity: (city: CityOption) => void;
  onUseLocation: () => void;
  onSkip: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const quick = QUICK_CITIES.map((name) => INDIAN_CITIES.find((city) => city.name === name)).filter(
    (city): city is CityOption => Boolean(city),
  );

  const rest = INDIAN_CITIES.filter((city) => !QUICK_CITIES.includes(city.name));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink text-ink-foreground">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-12">
        <WtfMark className="size-14" title="We the Future" />

        <h1 className="display-lg mt-7 text-balance">
          Find out what the government is building near you.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          Roads, hospitals, metro lines, water pipes. What was promised, what it cost, and whether
          it actually got done.
        </p>

        <p className="eyebrow mt-10 text-ink-muted">Where do you live?</p>

        <button
          type="button"
          onClick={onUseLocation}
          className="m3-state mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink-foreground px-6 py-4 text-base font-semibold text-ink hover:opacity-90"
        >
          <LocateFixed className="size-5" aria-hidden />
          Use my location
        </button>

        <p className="mt-5 text-center text-sm text-ink-muted">or pick your city</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(showAll ? [...quick, ...rest] : quick).map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => onPickCity(city)}
              className="m3-state rounded-xl border border-ink-line px-3 py-4 text-base font-medium hover:bg-white/5"
            >
              <MapPin className="mx-auto mb-1.5 size-4 text-ink-muted" aria-hidden />
              {city.name}
            </button>
          ))}
        </div>

        {!showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn(
              "m3-state mx-auto mt-5 rounded-full px-4 py-2 text-sm font-medium",
              "text-ink-muted underline underline-offset-4 hover:text-ink-foreground",
            )}
          >
            Show all {INDIAN_CITIES.length} cities
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSkip}
          className="m3-state mx-auto mt-8 rounded-full px-4 py-2 text-sm text-ink-muted hover:text-ink-foreground"
        >
          Just show me everything
        </button>
      </div>
    </div>
  );
}
