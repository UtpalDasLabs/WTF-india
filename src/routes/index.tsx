import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  INDIAN_CITIES,
  STATUS_CLASS,
  STATUS_LABEL,
  STATUS_ORDER,
  distanceKm,
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
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const here =
    location.state.status === "granted"
      ? { lat: location.state.lat, lng: location.state.lng }
      : null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
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
        if (!query) return true;
        return [
          project.name,
          project.plain_summary,
          project.department,
          project.state,
          project.district,
          project.sector,
        ]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(query));
      });

    withDistance.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return a.project.name.localeCompare(b.project.name);
    });
    return withDistance;
  }, [projects.data, search, statuses, here]);

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
        <LocationGate
          status={location.state.status}
          onRequest={location.request}
          onClear={location.clear}
          label={
            location.state.status === "granted" ? location.state.label : undefined
          }
          onCity={(city) => location.setManual(city.lat, city.lng, city.name)}
        />

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a road, hospital, metro, department or district"
            className="h-12 rounded-full bg-surface-container pl-11"
            aria-label="Search projects"
          />
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
        ) : view === "map" ? (
          <MapCanvas
            projects={filtered.map((item) => item.project)}
            you={here}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-surface-container p-6 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">Nothing matches yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try clearing the filters, searching a nearby district, or picking a
              different city.
            </p>
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={() => {
                setSearch("");
                setStatuses([]);
              }}
            >
              Clear filters
            </Button>
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
        )}

        <p className="pt-2 text-xs text-muted-foreground">
          Facts and timelines come from official sources and are checked by a reviewer.
          Ratings, reviews and photos come from the public and are kept separate.
        </p>
      </div>
    </AppShell>
  );
}
