import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, LocateFixed, Search, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
import { ApkDownloadCard } from "@/components/wtf/apk-download";
import { MapCanvas } from "@/components/wtf/map-canvas";
import { ProjectCard } from "@/components/wtf/project-card";
import { useFollow } from "@/hooks/use-follow";
import { useLocation } from "@/hooks/use-location";
import { projectsQuery, ratingsQuery, type Project } from "@/lib/queries";
import {
  CITY_RADIUS_KM,
  INDIAN_CITIES,
  STATUS_CLASS,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_ORDER,
  distanceKm,
  formatBudget,
  matchCityByText,
  nearestCity,
  normalizeText,
  projectInCity,
  randomMetro,
  type CityOption,
  type ProjectStatus,
} from "@/lib/wtf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "The map — government projects near you in India" },
      {
        name: "description",
        content:
          "Find government projects near you in India, see whether they are planned, ongoing, delayed, completed or finished early, and check the official sources behind every fact.",
      },
      {
        property: "og:title",
        content: "We the Future — Track government projects near you",
      },
      {
        property: "og:description",
        content:
          "Map and list of Indian government projects with official evidence, verified timelines and community reviews kept separate.",
      },
    ],
  }),
  component: Discover,
});

/**
 * A strip, not a masthead.
 *
 * This page used to open the app, so it carried the whole argument in a block of
 * ink half a screen tall. The feed makes that argument now, and what somebody
 * arriving here wants is the map — so the figures stay, on one line, and the map
 * gets the height back.
 */
function Ticker({ projects }: { projects: Project[] }) {
  const stats = useMemo(() => {
    const published = projects.filter((project) => project.published);
    const delayed = published.filter((project) => project.status === "delayed").length;
    const money = published.reduce((sum, project) => sum + (project.budget_inr ?? 0), 0);
    const mapped = published.filter(
      (project) => project.latitude != null && project.longitude != null,
    ).length;
    return { tracked: published.length, delayed, money, mapped };
  }, [projects]);

  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
      {[
        { label: "tracked", value: stats.tracked.toLocaleString("en-IN") },
        { label: "running late", value: stats.delayed.toLocaleString("en-IN") },
        { label: "on the map", value: stats.mapped.toLocaleString("en-IN") },
        { label: "of public money", value: formatBudget(stats.money) },
      ].map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-1.5">
          <dt className="sr-only">{stat.label}</dt>
          <dd data-numeric className="font-display text-lg font-medium">
            {stat.value}
          </dd>
          <span className="text-xs text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </dl>
  );
}

function LocationBar({
  status,
  label,
  onRequest,
  onClear,
  activeCity,
  onCity,
}: {
  status: string;
  label?: string | undefined;
  onRequest: () => void;
  onClear: () => void;
  activeCity: CityOption | null;
  onCity: (city: CityOption) => void;
}) {
  const denied = status === "denied" || status === "unavailable";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "granted" ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-2 text-sm">
          <LocateFixed className="size-4 text-primary" aria-hidden />
          Near <strong className="font-semibold">{label}</strong>
          <button
            type="button"
            onClick={onClear}
            className="ml-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            change
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={status === "locating"}
          className="m3-state inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-container-high disabled:opacity-60"
        >
          <LocateFixed className="size-4" aria-hidden />
          {status === "locating" ? "Locating…" : "Near me"}
        </button>
      )}

      {/* 26 city chips in a wall was noise; a select keeps every city one tap away. */}
      <label className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-2 text-sm">
        <span className="sr-only">City</span>
        <select
          value={activeCity?.name ?? ""}
          onChange={(event) => {
            const city = INDIAN_CITIES.find((item) => item.name === event.target.value);
            if (city) onCity(city);
            else onClear();
          }}
          className="cursor-pointer bg-transparent font-medium outline-none"
          aria-label="Filter by city"
        >
          <option value="">All of India</option>
          {INDIAN_CITIES.map((city) => (
            <option key={city.name} value={city.name}>
              {city.name}
            </option>
          ))}
        </select>
      </label>

      {denied ? (
        <span className="text-xs text-muted-foreground">
          Location is off — pick a city instead.
        </span>
      ) : null}
    </div>
  );
}

function Discover() {
  const projects = useQuery(projectsQuery());
  const ratings = useQuery(ratingsQuery());
  const location = useLocation();
  const follow = useFollow();

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [cityName, setCityName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const here =
    location.state.status === "granted"
      ? { lat: location.state.lat, lng: location.state.lng }
      : null;

  const chosenCity = cityName
    ? (INDIAN_CITIES.find((city) => city.name === cityName) ?? null)
    : null;
  const typedCity = chosenCity ? null : matchCityByText(search);
  const activeCity = chosenCity ?? typedCity;

  const pickCity = (city: CityOption) => {
    setCityName(city.name);
    setSelectedId(null);
    location.setManual(city.lat, city.lng, city.name);
  };

  const clearCity = () => {
    setCityName(null);
    if (typedCity) setSearch("");
  };

  const filtered = useMemo(() => {
    const query = normalizeText(search);
    // A city typed into the search box becomes the city filter, so the words
    // themselves are not also required to appear in the project text.
    const textQuery = typedCity ? "" : query;

    const withDistance = (projects.data ?? [])
      .filter((project) => project.published)
      .map((project) => ({
        project,
        distance:
          here && project.latitude != null && project.longitude != null
            ? distanceKm(here.lat, here.lng, project.latitude, project.longitude)
            : null,
      }))
      .filter(({ project }) => {
        if (statuses.length > 0 && !statuses.includes(project.status)) return false;
        if (activeCity && !projectInCity(project, activeCity)) return false;
        if (!textQuery) return true;
        return [
          project.name,
          project.plain_summary,
          project.department,
          project.state,
          project.district,
          project.sector,
        ]
          .filter(Boolean)
          .some((field) => normalizeText(field).includes(textQuery));
      });

    withDistance.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return a.project.name.localeCompare(b.project.name);
    });
    return withDistance;
  }, [projects.data, search, statuses, here, activeCity, typedCity]);

  // Most of the country has nothing tracked in it yet, so picking your city is
  // very likely to return nothing at all. Rather than a dead end, fall back to
  // the closest projects we do have and say plainly how far away they are.
  const nearest = useMemo(() => {
    if (!activeCity) return [];
    return (projects.data ?? [])
      .filter((project) => project.published)
      .map((project) => ({
        project,
        distance:
          project.latitude != null && project.longitude != null
            ? distanceKm(activeCity.lat, activeCity.lng, project.latitude, project.longitude)
            : null,
      }))
      .filter((item): item is { project: Project; distance: number } => item.distance != null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [projects.data, activeCity]);

  const toggleStatus = (status: ProjectStatus) =>
    setStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );

  const resetFilters = () => {
    setSearch("");
    setStatuses([]);
    setCityName(null);
  };

  const mapNode = (
    <MapCanvas
      projects={filtered.map((item) => item.project)}
      you={here}
      selectedId={selectedId}
      onSelect={setSelectedId}
      size="tall"
    />
  );

  const listNode = projects.isLoading ? (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-44 rounded-xl" />
      ))}
    </div>
  ) : projects.isError ? (
    <div className="rounded-xl border border-destructive/30 bg-destructive-container p-5 text-sm text-destructive-container-foreground">
      We could not load projects just now. Please try again in a moment.
    </div>
  ) : filtered.length === 0 ? (
    <div className="rounded-xl border border-border bg-surface p-10 text-center">
      <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <p className="display-sm mt-4">
        {activeCity ? `Nothing listed for ${activeCity.name} yet` : "Nothing matches yet"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {activeCity
          ? `We have nothing published within ${CITY_RADIUS_KM} km of ${activeCity.name}${statuses.length > 0 ? " with the statuses you picked" : ""}. Try another city, or tell us about a project we are missing.`
          : "Try clearing the filters or searching a nearby district."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={resetFilters}
          className="m3-state rounded-full border border-outline-variant px-4 py-2 text-sm font-medium hover:bg-surface-container-high"
        >
          Show all of India
        </button>
        <Link
          to="/suggest"
          className="m3-state rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
        >
          Suggest a project
        </Link>
      </div>

      {nearest.length > 0 ? (
        <div className="mt-8 border-t border-border pt-6 text-left">
          <p className="eyebrow text-muted-foreground">The closest ones we do track</p>
          <ul className="mt-3 space-y-3">
            {nearest.map(({ project, distance }) => (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  distance={distance}
                  rating={ratings.data?.[project.id] ?? null}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  ) : (
    <ul className="space-y-3">
      {filtered.map(({ project, distance }: { project: Project; distance: number | null }) => (
        <li key={project.id}>
          <ProjectCard
            project={project}
            distance={distance}
            rating={ratings.data?.[project.id] ?? null}
          />
        </li>
      ))}
    </ul>
  );

  const followed = filtered.filter((item) => follow.isFollowing(item.project.id));

  return (
    <AppShell width="wide">
      <h1 className="sr-only">Government projects near you</h1>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Ticker projects={projects.data ?? []} />
        <Link
          to="/"
          className="m3-state hidden shrink-0 items-center gap-1.5 rounded-full border border-outline-variant px-3.5 py-2 text-xs font-semibold hover:bg-surface-container-high sm:inline-flex"
        >
          <Flame className="size-3.5" aria-hidden />
          Back to the feed
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a city, road, hospital, metro or department"
            className="h-12 rounded-full border-outline-variant bg-surface pl-11 text-base"
            aria-label="Search projects"
          />
        </div>

        <LocationBar
          status={location.state.status}
          onRequest={location.request}
          onClear={clearCity}
          label={location.state.status === "granted" ? location.state.label : undefined}
          activeCity={activeCity}
          onCity={pickCity}
        />
      </div>

      {/* The map is the page now, not a panel beside a list. Zooming into a city
          hands it over to the aerial imagery, because a drawn map of a road
          project shows a line where the road is meant to be, and the question
          this app exists to ask is whether anything was built there. */}
      <div className="mt-5">{mapNode}</div>

      {/* A rail of what is on the map, in the order the map has them. Tapping one
          moves the map to its pin, which is how somebody reads a map on a phone
          without pinching around looking for the dots. */}
      {filtered.length > 0 ? (
        <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
          {filtered.slice(0, 30).map(({ project, distance }) => {
            const active = project.id === selectedId;
            return (
              <li key={project.id} className="w-64 shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className={cn(
                    "m3-state h-full w-full rounded-2xl border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-surface-container-high"
                      : "border-border bg-surface hover:bg-surface-container-high",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("size-2 rounded-full", STATUS_DOT[project.status])} />
                    {STATUS_LABEL[project.status]}
                    {distance != null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span data-numeric>{distance.toFixed(1)} km away</span>
                      </>
                    ) : null}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-sm font-semibold leading-snug">
                    {project.name}
                  </span>
                  <span data-numeric className="mt-1.5 block text-xs text-muted-foreground">
                    {formatBudget(project.budget_inr)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((status) => {
            const active = statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                className={cn(
                  "m3-state rounded-full border px-3 py-1.5 text-sm font-medium",
                  active
                    ? cn(STATUS_CLASS[status], "border-transparent")
                    : "border-outline-variant text-muted-foreground hover:bg-surface-container-high hover:text-foreground",
                )}
              >
                {STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {projects.isLoading
            ? "Loading projects…"
            : `${filtered.length} ${filtered.length === 1 ? "project" : "projects"}`}
          {activeCity ? ` · within ${CITY_RADIUS_KM} km of ${activeCity.name}` : ""}
        </p>
      </div>

      {followed.length > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <p className="eyebrow text-muted-foreground">You are following {followed.length}</p>
          <ul className="mt-3 divide-y divide-border">
            {followed.map(({ project }) => (
              <li key={project.id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="flex items-center justify-between gap-4 text-sm hover:underline"
                >
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {STATUS_LABEL[project.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6">{listNode}</div>

      <ApkDownloadCard className="mt-10" />

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground md:hidden">
        Facts and timelines come from official sources and are checked by a reviewer. Ratings,
        reviews and photos come from the public and are kept separate.
      </p>
    </AppShell>
  );
}
