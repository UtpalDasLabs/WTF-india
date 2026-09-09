import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, MessageSquare, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
import { Reactions } from "@/components/wtf/reactions";
import { ShareButton } from "@/components/wtf/share-button";
import { StatusChip } from "@/components/wtf/status-chip";
import { useFollow } from "@/hooks/use-follow";
import { computeDelay } from "@/lib/delay";
import { rankByHeat, type Heat } from "@/lib/hot";
import {
  projectsQuery,
  ratingsQuery,
  reactionsQuery,
  type Project,
  type ReactionCounts,
} from "@/lib/queries";
import { formatBudget, formatDate } from "@/lib/wtf";

export const Route = createFileRoute("/trending")({
  head: () => ({
    meta: [
      { title: "Hot right now — the projects India is watching" },
      {
        name: "description",
        content:
          "The government projects people are looking at today, ranked on how far past their promised date they are, how much public money is on them, and how much is being said about them.",
      },
      { property: "og:title", content: "Hot right now — We the Future" },
      {
        property: "og:description",
        content: "What India is watching in public infrastructure today.",
      },
    ],
  }),
  component: Trending,
});

function Row({
  project,
  heat,
  rank,
  talk,
  reactions,
}: {
  project: Project;
  heat: Heat;
  rank: number;
  talk: number;
  reactions: ReactionCounts | undefined;
}) {
  const follow = useFollow();
  const following = follow.isFollowing(project.id);
  const delay = computeDelay(project);
  const place = [project.district, project.state].filter(Boolean).join(", ") || "India";

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex items-start gap-4 py-5">
        <span
          data-numeric
          aria-hidden
          className="w-7 shrink-0 text-right font-display text-2xl font-medium leading-none text-muted-foreground/40 sm:w-10 sm:text-4xl"
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          {/* The community line first: this is a place, and it has people in it. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">w/{place}</span>
            <span aria-hidden>·</span>
            <StatusChip status={project.status} />
            <span className="inline-flex items-center gap-1 font-medium text-status-delayed">
              <Flame className="size-3.5" aria-hidden />
              {heat.reason}
            </span>
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

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="size-3.5" aria-hidden />
              {talk === 0 ? "No posts yet" : `${talk} ${talk === 1 ? "post" : "posts"}`}
            </span>
            {delay && delay.days > 0 ? (
              <span data-numeric>promised {formatDate(project.planned_end_date)}</span>
            ) : null}
            {project.budget_inr != null ? (
              <span data-numeric className="font-medium text-foreground">
                {formatBudget(project.budget_inr)}
              </span>
            ) : null}
          </div>

          <Reactions projectId={project.id} counts={reactions} className="mt-4" />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => follow.toggle(project.id)}
              aria-pressed={following}
              className={
                following
                  ? "m3-state inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:bg-surface-container-high"
                  : "m3-state inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
              }
            >
              <Users className="size-3.5" aria-hidden />
              {following ? "Joined" : "Join"}
            </button>
            <ShareButton
              project={project}
              className="border border-outline-variant bg-transparent px-3 py-1.5 text-xs text-foreground hover:bg-surface-container-high"
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function Trending() {
  const projects = useQuery(projectsQuery());
  const ratings = useQuery(ratingsQuery());
  const reactions = useQuery(reactionsQuery());

  const ranked = useMemo(
    () =>
      rankByHeat(
        (projects.data ?? []).filter((project) => project.published),
        ratings.data,
      ),
    [projects.data, ratings.data],
  );

  const late = ranked.filter(({ project }) => {
    const delay = computeDelay(project);
    return delay != null && delay.days > 0;
  }).length;

  return (
    <AppShell>
      <section className="-mx-4 mb-6 bg-ink px-4 py-10 text-ink-foreground md:-mx-6 md:rounded-2xl md:px-10 md:py-12">
        <p className="eyebrow flex items-center gap-2 text-ink-muted">
          <Flame className="size-4" aria-hidden />
          Hot right now
        </p>
        <h1 className="display-hero mt-4 text-balance">What India is watching today.</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
          Ranked on the government's own numbers — how far past its promised date a project is and
          how much public money is on it — nudged by how much is being said about it.{" "}
          {late > 0 ? `${late} of these are running late.` : null}
        </p>
      </section>

      {projects.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <p className="display-sm">Nothing here yet</p>
          <Link
            to="/"
            className="m3-state mt-6 inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Look around you instead
          </Link>
        </div>
      ) : (
        <ul>
          {ranked.map(({ project, heat }, index) => (
            <Row
              key={project.id}
              project={project}
              heat={heat}
              rank={index + 1}
              talk={ratings.data?.[project.id]?.count ?? 0}
              reactions={reactions.data}
            />
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Every figure here comes from the project's own official record. A project with no published
        completion date is not treated as late, rather than being given a guessed date.
      </p>
    </AppShell>
  );
}
