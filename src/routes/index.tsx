import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  List,
  LocateFixed,
  Map as MapIcon,
  Search,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
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

function LocationGate({
  status,
  onRequest,
  onCity,
  label,
  onClear,
}: {
  status: string;
  onRequest: () => void;
  onCity: (city: (typeof INDIAN_CITIES)[number]) => void;
  label?: string | undefined;
  onClear: () => void;
}) {
  if (status === "granted") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-primary-container p-3 text-primary-container-foreground">
        <p className="flex items-center gap-2 text-sm font-medium">
          <LocateFixed className="size-4" aria-hidden />
          Showing projects near {label}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="rounded-full text-primary-container-foreground"
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-surface-container p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Compass className="size-4" aria-hidden />
        {status === "locating"
          ? "Finding where you are…"
          : status === "denied"
            ? "Location permission was turned off"
            : status === "unavailable"
              ? "We could not read your location"
              : "See projects around you"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {status === "denied"
          ? "That is fine. Allow location in your browser settings, or pick a city below and everything still works."
          : status === "unavailable"
            ? "Your device did not share a location. Pick a city below instead."
            : "Share your location once and projects are sorted by how close they are. You can also just pick a city."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {status !== "denied" ? (
          <Button
            onClick={onRequest}
            disabled={status === "locating"}
            className="rounded-full"
          >
            <LocateFixed className="mr-1.5 size-4" aria-hidden />
            {status === "locating" ? "Locating…" : "Use my location"}
          </Button>
        ) : null}
      </div>

      <div className="mt-3">
        <p className="label-sm text-muted-foreground">Or choose a city</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {INDIAN_CITIES.map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => onCity(city)}
              className="m3-state rounded-full border border-outline px-3 py-1.5 text-sm"
            >
              {city.name}
            </button>
          ))}
        </div>
      </div>
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
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );


  return (
    <AppShell>
      <h1 className="sr-only">Government projects near you</h1>

      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-3xl bg-primary-container">
          <img
            src={heroImage}
            alt="Neighbours in an Indian city looking at a new metro line, road, hospital and water pipeline"
            width={1920}
            height={1088}
            className="h-44 w-full object-cover object-[70%_center] sm:h-60"
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-[oklch(0.28_0.1_272/0.92)] via-[oklch(0.28_0.1_272/0.72)] to-transparent"
            aria-hidden
          />
          <div className="absolute inset-0 flex flex-col justify-center gap-2 p-5">
            <p className="label-sm text-white/85">We the Future</p>
            <h2 className="max-w-[16rem] text-xl font-semibold leading-tight tracking-tight text-white sm:max-w-sm sm:text-2xl">
              Public money, public proof.
            </h2>
            <p className="max-w-[17rem] text-sm leading-snug text-white/90 sm:max-w-md">
              Every project here is checked against official records, with community
              voices kept separate.
            </p>
            <div className="mt-1">
              <Link
                to="/constitution"
                className="m3-state inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-sm font-medium text-[oklch(0.28_0.1_272)]"
              >
                <ScrollText className="size-4" aria-hidden />
                Read the Constitution
              </Link>
            </div>
          </div>
        </section>


        <LocationGate
          status={location.state.status}
          onRequest={location.request}
          onClear={location.clear}
          label={
            location.state.status === "granted" ? location.state.label : undefined
          }
          onCity={pickCity}
        />

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a city, road, hospital, metro or department"
            className="h-12 rounded-full bg-surface-container pl-11"
            aria-label="Search projects"
          />
        </div>

        <div>
          <p className="label-sm text-muted-foreground">City</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={clearCity}
              aria-pressed={!activeCity}
              className={cn(
                "m3-state shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                !activeCity
                  ? "border-transparent bg-secondary-container text-secondary-container-foreground"
                  : "border-outline text-muted-foreground",
              )}
            >
              All of India
            </button>
            {INDIAN_CITIES.map((city) => {
              const active = activeCity?.name === city.name;
              return (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => (active ? clearCity() : pickCity(city))}
                  aria-pressed={active}
                  className={cn(
                    "m3-state shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                    active
                      ? "border-transparent bg-secondary-container text-secondary-container-foreground"
                      : "border-outline text-muted-foreground",
                  )}
                >
                  {city.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_ORDER.map((status) => {
            const active = statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                className={cn(
                  "m3-state shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                  active
                    ? cn(STATUS_CLASS[status], "border-transparent")
                    : "border-outline text-muted-foreground",
                )}
              >
                {STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>

        {activeCity ? (
          <p className="text-sm text-muted-foreground">
            Showing {activeCity.name}, {activeCity.state}
            {typedCity ? " (matched from what you typed)" : ""}. Anything within{" "}
            {CITY_RADIUS_KM} km counts as this city.
          </p>
        ) : null}


        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {projects.isLoading
              ? "Loading projects…"
              : `${filtered.length} ${filtered.length === 1 ? "project" : "projects"} found`}
          </p>
          <div className="flex rounded-full bg-surface-container p-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
                view === "list" &&
                  "bg-secondary-container text-secondary-container-foreground",
              )}
            >
              <List className="size-4" aria-hidden /> List
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
                view === "map" &&
                  "bg-secondary-container text-secondary-container-foreground",
              )}
            >
              <MapIcon className="size-4" aria-hidden /> Map
            </button>
          </div>
        </div>

        {projects.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-40 rounded-3xl" />
            ))}
          </div>
        ) : projects.isError ? (
          <div className="rounded-3xl bg-destructive-container p-4 text-sm text-destructive-container-foreground">
            We could not load projects just now. Please try again in a moment.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-surface-container p-6 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">
              {activeCity
                ? `No projects listed for ${activeCity.name} yet`
                : "Nothing matches yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeCity
                ? `We have nothing published within ${CITY_RADIUS_KM} km of ${activeCity.name}${statuses.length > 0 ? " with the statuses you picked" : ""}. Try another city, or tell us about a project we are missing.`
                : "Try clearing the filters or searching a nearby district."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setSearch("");
                  setStatuses([]);
                  setCityName(null);
                }}
              >
                Show all of India
              </Button>
              <Button asChild className="rounded-full">
                <Link to="/suggest">Suggest a project</Link>
              </Button>
            </div>
          </div>
        ) : view === "map" ? (
          <MapCanvas
            projects={filtered.map((item) => item.project)}
            you={here}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
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
        )}

        <p className="pt-2 text-xs text-muted-foreground">
          Facts and timelines come from official sources and are checked by a reviewer.
          Ratings, reviews and photos come from the public and are kept separate.
        </p>
      </div>
    </AppShell>
  );
}
