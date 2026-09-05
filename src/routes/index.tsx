import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { List, LocateFixed, Map as MapIcon, Search, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
import { ApkDownloadCard } from "@/components/wtf/apk-download";
import { MapCanvas } from "@/components/wtf/map-canvas";
import { ProjectCard } from "@/components/wtf/project-card";
import { useLocation } from "@/hooks/use-location";
import { projectsQuery, ratingsQuery, type Project } from "@/lib/queries";
import {
  CITY_RADIUS_KM,
  INDIAN_CITIES,
  STATUS_CLASS,
  STATUS_LABEL,
  STATUS_ORDER,
  distanceKm,
  formatBudget,
  matchCityByText,
  normalizeText,
  projectInCity,
  type CityOption,
  type ProjectStatus,
} from "@/lib/wtf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "We the Future — Track government projects near you in India" },
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
 * The masthead earns its height by carrying live figures rather than a stock
 * illustration — the numbers are the argument the product is making.
 */
function Masthead({ projects }: { projects: Project[] }) {
  const stats = useMemo(() => {
    const published = projects.filter((project) => project.published);
    const delayed = published.filter((project) => project.status === "delayed").length;
    const money = published.reduce((sum, project) => sum + (project.budget_inr ?? 0), 0);
    return { tracked: published.length, delayed, money };
  }, [projects]);

  return (
    <section className="-mx-4 mb-8 bg-ink px-4 py-12 text-ink-foreground md:-mx-6 md:rounded-2xl md:px-10 md:py-14">
      <div className="max-w-3xl">
        <p className="eyebrow text-ink-muted">We the Future · India</p>
        <h2 className="display-hero mt-5 text-balance">
          Public money leaves a <em className="font-normal italic">paper trail</em>. Follow it.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted">
          Every project here is checked against official records — sanction orders, tenders, audit
          reports. What the public says about them is kept separate, and labelled as such.
        </p>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-ink-line pt-8 sm:grid-cols-3 md:max-w-2xl">
        {[
          { label: "Projects tracked", value: stats.tracked.toLocaleString("en-IN") },
          { label: "Running late", value: stats.delayed.toLocaleString("en-IN") },
          { label: "Public money covered", value: formatBudget(stats.money) },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="eyebrow text-ink-muted">{stat.label}</dt>
            <dd
              data-numeric
              className="display-lg mt-2 text-ink-foreground"
              style={{ fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <Link
        to="/constitution"
        className="m3-state mt-9 inline-flex items-center gap-2 rounded-full bg-ink-foreground px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-90"
      >
        Read the Constitution
      </Link>
    </section>
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
          {status === "locating" ? "Locating…" : "Use my location"}
        </button>
      )}

      {/* 26 city chips in a wall was noise; a select keeps every city one tap away. */}
      <label className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-2 text-sm">
        <span className="text-muted-foreground">City</span>
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

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [cityName, setCityName] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
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

  return (
    <AppShell width="wide">
      <h1 className="sr-only">Government projects near you</h1>

      <Masthead projects={projects.data ?? []} />

      <div className="space-y-4">
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
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {projects.isLoading
            ? "Loading projects…"
            : `${filtered.length} ${filtered.length === 1 ? "project" : "projects"}`}
          {activeCity ? ` · within ${CITY_RADIUS_KM} km of ${activeCity.name}` : ""}
        </p>

        {/* Desktop shows both panes at once, so the toggle is only for narrow screens. */}
        <div className="flex rounded-full border border-outline-variant p-0.5 lg:hidden">
          {(
            [
              ["list", List, "List"],
              ["map", MapIcon, "Map"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={cn(
                "m3-state flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
                view === key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-8">
        <div className={cn(view === "map" && "hidden lg:block")}>{listNode}</div>

        {/* The map tracks the list on desktop instead of hiding behind a tab. It
            carries its own frame and aspect ratio, so it is not boxed again here. */}
        <div className={cn("lg:sticky lg:top-24", view === "list" && "hidden lg:block")}>
          {mapNode}
        </div>
      </div>

      <ApkDownloadCard className="mt-10" />

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground md:hidden">
        Facts and timelines come from official sources and are checked by a reviewer. Ratings,
        reviews and photos come from the public and are kept separate.
      </p>
    </AppShell>
  );
}
