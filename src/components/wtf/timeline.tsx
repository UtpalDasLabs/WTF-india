import { BadgeCheck, CircleDashed } from "lucide-react";

import type { Milestone, Project } from "@/lib/queries";
import { STATUS_LABEL, formatDate } from "@/lib/wtf";
import { cn } from "@/lib/utils";

export function VerifiedTimeline({
  project,
  milestones,
}: {
  project: Project;
  milestones: Milestone[];
}) {
  return (
    <section
      aria-labelledby="timeline-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="timeline-heading" className="display-sm">
        Official timeline
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dates recorded in official documents. Community comments never change this list.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-surface-container-high p-3">
          <dt className="text-xs text-muted-foreground">Started</dt>
          <dd className="font-medium">{formatDate(project.start_date)}</dd>
        </div>
        <div className="rounded-lg bg-surface-container-high p-3">
          <dt className="text-xs text-muted-foreground">Promised finish</dt>
          <dd className="font-medium">{formatDate(project.planned_end_date)}</dd>
        </div>
        <div className="rounded-lg bg-surface-container-high p-3">
          <dt className="text-xs text-muted-foreground">Actually finished</dt>
          <dd className="font-medium">{formatDate(project.actual_end_date)}</dd>
        </div>
        <div className="rounded-lg bg-surface-container-high p-3">
          <dt className="text-xs text-muted-foreground">Current stage</dt>
          <dd className="font-medium">{STATUS_LABEL[project.status]}</dd>
        </div>
      </dl>

      <ol className="mt-5 space-y-4 border-l border-border pl-5">
        {milestones.map((milestone) => (
          <li key={milestone.id} className="relative">
            <span
              className={cn(
                "absolute -left-[1.72rem] grid size-5 place-items-center rounded-full",
                milestone.is_verified
                  ? "bg-status-completed-container text-status-completed"
                  : "bg-tertiary-container text-tertiary-container-foreground",
              )}
            >
              {milestone.is_verified ? (
                <BadgeCheck className="size-3.5" aria-hidden />
              ) : (
                <CircleDashed className="size-3.5" aria-hidden />
              )}
            </span>
            <p className="text-sm font-medium">{milestone.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(milestone.event_date)} ·{" "}
              {milestone.is_verified ? "Verified" : "Reported, not verified yet"}
            </p>
            {milestone.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{milestone.description}</p>
            ) : null}
          </li>
        ))}
        {milestones.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No dated milestones have been verified yet.
          </li>
        ) : null}
      </ol>
    </section>
  );
}
