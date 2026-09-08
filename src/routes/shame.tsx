import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Skull } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
import { ShareButton } from "@/components/wtf/share-button";
import { StatusChip } from "@/components/wtf/status-chip";
import { computeDelay } from "@/lib/delay";
import { projectsQuery, type Project } from "@/lib/queries";
import { formatBudget, formatDate } from "@/lib/wtf";

export const Route = createFileRoute("/shame")({
  head: () => ({
    meta: [
      { title: "Hall of Shame — the most delayed projects in India" },
      {
        name: "description",
        content:
          "Government projects ranked by how far past their own promised completion date they are, using the dates in the official record.",
      },
      { property: "og:title", content: "Hall of Shame — We the Future" },
      {
        property: "og:description",
        content:
          "Ranked by the government's own numbers: how late each project is against the date it promised.",
      },
    ],
  }),
  component: HallOfShame,
});

function Row({ project, rank }: { project: Project; rank: number }) {
  const delay = computeDelay(project);
  if (!delay || delay.days <= 0) return null;

  const place = [project.district, project.state].filter(Boolean).join(", ") || "India";

  return (
    <li className="relative border-b border-border last:border-b-0">
      <div className="flex items-start gap-4 py-6 sm:gap-6">
        <span
          data-numeric
          aria-hidden
          className="w-10 shrink-0 text-right font-display text-3xl font-medium leading-none text-muted-foreground/40 sm:w-16 sm:text-5xl"
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={project.status} />
            <span className="text-xs text-muted-foreground">{place}</span>
          </div>

          <h2 className="display-sm mt-2 text-balance">
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="hover:underline"
            >
              {project.name}
            </Link>
          </h2>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="figure-lg text-status-delayed">
              {delay.days.toLocaleString("en-IN")}{" "}
              <span className="text-base font-semibold text-foreground">days late</span>
            </span>
            <span className="text-sm text-muted-foreground">
              promised {formatDate(project.planned_end_date)}
            </span>
            {project.budget_inr != null ? (
              <span data-numeric className="text-sm font-medium">
                {formatBudget(project.budget_inr)}
              </span>
            ) : null}
          </div>
        </div>

        <ShareButton project={project} className="hidden shrink-0 sm:inline-flex" />
      </div>
    </li>
  );
}

function HallOfShame() {
  const projects = useQuery(projectsQuery());

  // Ranked purely on the gap between a project's own promised date and reality.
  // Votes are deliberately not part of this: a popularity contest is brigadeable
  // and indefensible, whereas every row here is the government's own arithmetic.
  const ranked = useMemo(() => {
    return (projects.data ?? [])
      .filter((project) => project.published)
      .map((project) => ({ project, delay: computeDelay(project) }))
      .filter((entry) => entry.delay != null && entry.delay.days > 0)
      .sort((a, b) => (b.delay?.days ?? 0) - (a.delay?.days ?? 0));
  }, [projects.data]);

  const worst = ranked[0];
  const totalDays = ranked.reduce((sum, entry) => sum + (entry.delay?.days ?? 0), 0);
  const totalMoney = ranked.reduce((sum, entry) => sum + (entry.project.budget_inr ?? 0), 0);

  return (
    <AppShell>
      <section className="-mx-4 mb-8 bg-ink px-4 py-10 text-ink-foreground md:-mx-6 md:rounded-2xl md:px-10 md:py-12">
        <p className="eyebrow flex items-center gap-2 text-ink-muted">
          <Skull className="size-4" aria-hidden />
          Hall of Shame
        </p>
        <h1 className="display-hero mt-4 text-balance">Late, and still counting.</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
          Ranked by the government's own numbers — how far past its promised date each project is.
          Not by votes, not by opinion.
        </p>

        {ranked.length > 0 ? (
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-ink-line pt-6 sm:grid-cols-3 md:max-w-2xl">
            {[
              ["Projects running late", ranked.length.toLocaleString("en-IN")],
              ["Days late, added up", totalDays.toLocaleString("en-IN")],
              ["Money involved", formatBudget(totalMoney)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="eyebrow text-ink-muted">{label}</dt>
                <dd data-numeric className="mt-2 text-2xl font-semibold">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {projects.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <p className="display-sm">Nothing is overdue right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Every tracked project is either finished or still inside the date it was promised by.
            That will change as more projects are added.
          </p>
          <Link
            to="/"
            className="m3-state mt-6 inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Browse all projects
          </Link>
        </div>
      ) : (
        <>
          {worst ? (
            <p className="mb-2 text-sm text-muted-foreground">
              The worst offender is{" "}
              <strong className="font-semibold text-foreground">{worst.delay?.label}</strong>.
            </p>
          ) : null}
          <ul>
            {ranked.map((entry, index) => (
              <Row key={entry.project.id} project={entry.project} rank={index + 1} />
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Every figure here comes from the project's own official record. A project with no published
        completion date is not ranked, rather than being given a guessed one.
      </p>
    </AppShell>
  );
}
