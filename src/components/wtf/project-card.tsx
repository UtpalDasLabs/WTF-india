import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bookmark, MapPin, Star } from "lucide-react";

import { StatusChip, VerificationChip } from "@/components/wtf/status-chip";
import type { Project } from "@/lib/queries";
import { formatBudget } from "@/lib/wtf";
import { useFollow } from "@/hooks/use-follow";
import { computeDelay } from "@/lib/delay";
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
  unknown: "bg-muted-foreground",
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
  const follow = useFollow();
  const following = follow.isFollowing(project.id);
  const delay = computeDelay(project);

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
            {delay && delay.days > 0 ? (
              <span className="text-xs font-semibold text-status-delayed">{delay.label}</span>
            ) : null}
            {distance != null ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {distance < 1 ? "Under 1 km" : `${Math.round(distance)} km`}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-pressed={following}
              aria-label={following ? "Stop following this project" : "Follow this project"}
              onClick={(event) => {
                // The card is a link; following must not navigate.
                event.preventDefault();
                event.stopPropagation();
                follow.toggle(project.id);
              }}
              className={cn(
                "m3-state grid size-8 place-items-center rounded-full",
                following
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-surface-container-high hover:text-foreground",
              )}
            >
              <Bookmark className={cn("size-4", following && "fill-current")} aria-hidden />
            </button>
            <ArrowUpRight
              className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </div>
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
