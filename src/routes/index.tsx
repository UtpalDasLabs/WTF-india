import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, X } from "lucide-react";

import { AppShell } from "@/components/wtf/app-shell";
import { Feed } from "@/components/wtf/feed";
import { Radar } from "@/components/wtf/radar";
import { useLocation } from "@/hooks/use-location";
import { useOnboarding } from "@/hooks/use-onboarding";
import { rankByHeat } from "@/lib/hot";
import {
  postCountsQuery,
  projectsQuery,
  ratingsQuery,
  reactionsQuery,
  recentPhotosQuery,
  type Post,
} from "@/lib/queries";
import { CITY_RADIUS_KM, INDIAN_CITIES, nearestCity, projectInCity, randomMetro } from "@/lib/wtf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "We the Future — where does the taxpayer's money actually go?" },
      {
        name: "description",
        content:
          "A feed of the government projects India is watching: how late each one is, how much public money is on it, and what people standing in front of it are saying.",
      },
      { property: "og:title", content: "We the Future — where does your money go?" },
      {
        property: "og:description",
        content: "Swipe through the projects your taxes paid for, and say what you see.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const projects = useQuery(projectsQuery());
  const ratings = useQuery(ratingsQuery());
  const reactions = useQuery(reactionsQuery());
  const counts = useQuery(postCountsQuery());
  const photos = useQuery(recentPhotosQuery());
  const location = useLocation();
  const onboarding = useOnboarding();

  const [cityName, setCityName] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  // Where to start somebody who declines location. Fixed on mount so the answer
  // cannot change under them while the radar is running.
  const [fallbackCity] = useState(randomMetro);
  const askedRef = useRef(false);

  // The permission prompt goes up the moment a first-time visitor arrives, with
  // the radar already turning behind it. Asking on arrival rather than behind a
  // button is the whole point: the app should know what is near you before it
  // asks you to do anything.
  useEffect(() => {
    if (onboarding.done !== false || askedRef.current) return;
    askedRef.current = true;
    if (location.state.status === "idle") location.request();
    // location.request is stable; onboarding.done is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding.done]);

  const published = useMemo(
    () => (projects.data ?? []).filter((project) => project.published),
    [projects.data],
  );

  const city = cityName ? (INDIAN_CITIES.find((item) => item.name === cityName) ?? null) : null;

  const cards = useMemo(() => {
    const scope = city ? published.filter((project) => projectInCity(project, city)) : published;
    return rankByHeat(scope, ratings.data);
  }, [published, city, ratings.data]);

  /** The newest photograph per project, so a card can wear it. */
  const newest = useMemo(() => {
    const map: Record<string, Post> = {};
    for (const post of photos.data ?? []) {
      // The query already comes back newest first, so the first one wins.
      if (!map[post.project_id]) map[post.project_id] = post;
    }
    return map;
  }, [photos.data]);

  // First run: scan, then hand over to a feed that is about where you are
  // rather than about the whole country.
  if (onboarding.done === false && !scanned) {
    const declined = location.state.status === "denied" || location.state.status === "unavailable";
    const origin =
      location.state.status === "granted"
        ? { lat: location.state.lat, lng: location.state.lng }
        : declined
          ? { lat: fallbackCity.lat, lng: fallbackCity.lng }
          : null;

    return (
      <Radar
        projects={published}
        origin={origin}
        placeLabel={declined ? fallbackCity.name : "you"}
        approximate={declined}
        onDone={() => {
          // Declining location is not a dead end: it just means we start you in
          // a large city instead, which you can drop from the bar at the top.
          if (declined) location.setManual(fallbackCity.lat, fallbackCity.lng, fallbackCity.name);

          // Scoping the feed to a city that has nothing in it would replace a
          // feed with an empty screen, so it is only applied when there is
          // actually something there to swipe through.
          const found = declined
            ? fallbackCity
            : origin
              ? nearestCity(origin.lat, origin.lng)
              : null;
          if (found && published.some((project) => projectInCity(project, found))) {
            setCityName(found.name);
          }

          setScanned(true);
          onboarding.finish();
        }}
      />
    );
  }

  return (
    <AppShell immersive>
      <h1 className="sr-only">
        The government projects India is watching, most talked about first
      </h1>

      {projects.isLoading ? (
        <div className="grid h-[100dvh] place-items-center bg-ink text-ink-foreground">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <p className="text-sm text-ink-muted">Loading the ledger…</p>
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="grid h-[100dvh] place-items-center bg-ink px-6 text-center text-ink-foreground">
          <div>
            <p className="display-sm">Nothing to show yet</p>
            <Link
              to="/discover"
              className="m3-state mt-6 inline-flex rounded-full bg-ink-foreground px-4 py-2 text-sm font-semibold text-ink"
            >
              Look at the map instead
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* One line of chrome over the feed: where this is about, and the way
              out of it. Anything more would be a masthead. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:top-16">
            {city ? (
              <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/45 py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <MapPin className="size-3.5" aria-hidden />
                {cards.length} within {CITY_RADIUS_KM} km of {city.name}
                <button
                  type="button"
                  onClick={() => setCityName(null)}
                  aria-label="Show all of India instead"
                  className="grid size-6 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ) : (
              <span className="pointer-events-auto rounded-full bg-black/45 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                {cards.length.toLocaleString("en-IN")} projects across India
              </span>
            )}
          </div>

          <Feed
            cards={cards}
            photos={newest}
            counts={counts.data ?? {}}
            reactions={reactions.data}
          />
        </>
      )}
    </AppShell>
  );
}
