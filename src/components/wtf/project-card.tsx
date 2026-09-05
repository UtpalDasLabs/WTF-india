import { Link } from "@tanstack/react-router";
import { MapPin, Star } from "lucide-react";

import { StatusChip, VerificationChip } from "@/components/wtf/status-chip";
import type { Project } from "@/lib/queries";
import { formatBudget } from "@/lib/wtf";

export function ProjectCard({
  project,
  distance,
  rating,
}: {
  project: Project;
  distance?: number | null;
  rating?: { avg: number; count: number } | null;
}) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="m3-state block rounded-3xl bg-surface-container p-4 shadow-e1 hover:shadow-e2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={project.status} />
        {distance != null ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden />
            {distance < 1 ? "Under 1 km away" : `${Math.round(distance)} km away`}
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug">{project.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {project.plain_summary}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-muted-foreground">Where</dt>
          <dd className="font-medium">
            {[project.district, project.state].filter(Boolean).join(", ") || "India"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Money set aside</dt>
          <dd className="font-medium">{formatBudget(project.budget_inr)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <VerificationChip
          status={project.verification_status}
          confidence={project.confidence}
        />
        {rating && rating.count > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-tertiary-container-foreground">
            <Star className="size-3.5 fill-current" aria-hidden />
            {rating.avg.toFixed(1)}
            <span className="text-muted-foreground">
              ({rating.count} {rating.count === 1 ? "person" : "people"})
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No community ratings yet</span>
        )}
      </div>
    </Link>
  );
}
