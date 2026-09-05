import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MapPin, Star } from "lucide-react";

import { StatusChip, VerificationChip } from "@/components/wtf/status-chip";
import type { Project } from "@/lib/queries";
import { formatBudget } from "@/lib/wtf";
import { cn } from "@/lib/utils";

/**
 * The status colour runs as a rail down the leading edge, so a column of cards can
 * be scanned for delays without reading a single word.
 */
const STATUS_RAIL: Record<Project["status"], string> = {
  planned: "bg-status-planned",
  ongoing: "bg-status-ongoing",
  delayed: "bg-status-delayed",
  completed: "bg-status-completed",
  finished_early: "bg-status-early",
};

export function ProjectCard({
  project,
  distance,
  rating,
}: {
  project: Project;
  distance?: number | null;
  rating?: { avg: number; count: number } | null;
}) {
  const place = [project.district, project.state].filter(Boolean).join(", ") || "India";

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="lift group relative block overflow-hidden rounded-xl border border-border bg-surface pl-5 hover:border-outline"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", STATUS_RAIL[project.status])}
      />

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={project.status} />
            {distance != null ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {distance < 1 ? "Under 1 km" : `${Math.round(distance)} km`}
              </span>
            ) : null}
          </div>
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </div>

        <h3 className="display-sm mt-3 text-balance text-foreground">{project.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {project.plain_summary}
        </p>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="figure-lg text-foreground">{formatBudget(project.budget_inr)}</span>
          <span className="text-xs text-muted-foreground">set aside · {place}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <VerificationChip status={project.verification_status} confidence={project.confidence} />
          {rating && rating.count > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium">
              <Star className="size-3.5 fill-current text-tertiary" aria-hidden />
              {rating.avg.toFixed(1)}
              <span className="text-muted-foreground">
                ({rating.count} {rating.count === 1 ? "person" : "people"})
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
