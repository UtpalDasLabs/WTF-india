import { useMemo } from "react";
import { Link } from "@tanstack/react-router";

import type { Project } from "@/lib/queries";
import { STATUS_DOT, STATUS_LABEL } from "@/lib/wtf";
import { cn } from "@/lib/utils";

/**
 * Lightweight coordinate map of India. It plots project pins by latitude and
 * longitude on a fixed bounding box, so discovery works without any map SDK.
 */
const BOUNDS = { minLat: 6.5, maxLat: 35.8, minLng: 67.5, maxLng: 97.5 };

function project(lat: number, lng: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x: Math.min(97, Math.max(3, x)), y: Math.min(97, Math.max(3, y)) };
}

export function MapCanvas({
  projects,
  you,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  you?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const pins = useMemo(
    () =>
      projects
        .filter((item) => item.latitude != null && item.longitude != null)
        .map((item) => ({ item, pos: project(item.latitude!, item.longitude!) })),
    [projects],
  );

  const youPos = you ? project(you.lat, you.lng) : null;
  const selected = projects.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface-container">
      <div
        className="relative aspect-4/5 w-full sm:aspect-16/10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 32% 28%, var(--primary-container) 0%, transparent 42%), radial-gradient(circle at 70% 62%, var(--tertiary-container) 0%, transparent 46%), linear-gradient(180deg, var(--surface-container) 0%, var(--surface-container-high) 100%)",
        }}
        role="img"
        aria-label="Map of India showing government project locations"
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(var(--outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--outline-variant) 1px, transparent 1px)",
            backgroundSize: "12.5% 12.5%",
          }}
          aria-hidden
        />

        {youPos ? (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${youPos.x}%`, top: `${youPos.y}%` }}
          >
            <span className="block size-3 rounded-full bg-primary ring-4 ring-primary/25" />
            <span className="mt-1 block whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              You
            </span>
          </div>
        ) : null}

        {pins.map(({ item, pos }) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item.id)}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-1 transition-transform",
              selectedId === item.id ? "scale-125" : "hover:scale-115",
            )}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            aria-label={`${item.name} — ${STATUS_LABEL[item.status]}`}
          >
            <span
              className={cn(
                "block size-3.5 rounded-full ring-2 ring-surface",
                STATUS_DOT[item.status],
              )}
            />
          </button>
        ))}
      </div>

      {selected ? (
        <div className="border-t border-border bg-surface-container-high p-3">
          <p className="text-xs text-muted-foreground">
            {[selected.district, selected.state].filter(Boolean).join(", ")} ·{" "}
            {STATUS_LABEL[selected.status]}
          </p>
          <Link
            to="/projects/$projectId"
            params={{ projectId: selected.id }}
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            {selected.name}
          </Link>
        </div>
      ) : (
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          Tap a dot to see which project it is.
        </p>
      )}
    </div>
  );
}
