import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, IndianRupee, MapPin, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
import { CommunitySection } from "@/components/wtf/community-section";
import { EvidencePanel } from "@/components/wtf/evidence-panel";
import { ShareButton } from "@/components/wtf/share-button";
import { StatusChip, VerificationChip } from "@/components/wtf/status-chip";
import { VerifiedTimeline } from "@/components/wtf/timeline";
import { milestonesQuery, projectQuery, reviewsQuery, sourcesQuery } from "@/lib/queries";
import { useFollow } from "@/hooks/use-follow";
import { computeDelay } from "@/lib/delay";
import { formatBudget, formatDate } from "@/lib/wtf";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project details — We the Future" },
      {
        name: "description",
        content:
          "Plain English details of a government project in India: official timeline, verified sources, evidence quotes and separate community reviews.",
      },
      { property: "og:title", content: "Project details — We the Future" },
      {
        property: "og:description",
        content:
          "See the official record behind a government project, with sources, verification status and community feedback kept apart.",
      },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = useQuery(projectQuery(projectId));
  const sources = useQuery(sourcesQuery(projectId));
  const milestones = useQuery(milestonesQuery(projectId));
  const reviews = useQuery(reviewsQuery(projectId));
  const follow = useFollow();

  if (project.isLoading) {
    return (
      <AppShell>
        <div className="space-y-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (!project.data) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold">This project is not available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may still be waiting for a reviewer to check it.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Back to projects
          </Link>
        </div>
      </AppShell>
    );
  }

  const data = project.data;
  const delay = computeDelay(data);

  return (
    <AppShell width="wide">
      <Link
        to="/"
        className="m3-state -ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All projects
      </Link>

      {/* The verified record leads; community voice sits alongside it on desktop so the
          separation the product promises is visible rather than merely stated. */}
      <article className="mt-4 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="space-y-5">
          <header>
            {/* The community banner. A project is a place people can be in, so
                the page opens with where it is and a way to join, the way a
                subreddit opens with its name and a Join button — the facts
                below it are what that community is arguing about. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-container p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  w/{[data.district, data.state].filter(Boolean).join(", ") || "India"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {reviews.data?.length ?? 0} {(reviews.data?.length ?? 0) === 1 ? "post" : "posts"}{" "}
                  · anyone can add what they see on the ground
                </p>
              </div>
              <button
                type="button"
                onClick={() => follow.toggle(data.id)}
                aria-pressed={follow.isFollowing(data.id)}
                className={
                  follow.isFollowing(data.id)
                    ? "m3-state inline-flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant px-4 py-2 text-sm font-semibold hover:bg-surface-container-high"
                    : "m3-state inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
                }
              >
                <Users className="size-4" aria-hidden />
                {follow.isFollowing(data.id) ? "Joined" : "Join"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <StatusChip status={data.status} />
              <VerificationChip status={data.verification_status} confidence={data.confidence} />
              {delay && delay.days > 0 ? (
                <span className="inline-flex items-center rounded-full bg-status-delayed-container px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-status-delayed">
                  {delay.label}
                </span>
              ) : null}
              <ShareButton project={data} sources={sources.data ?? undefined} className="ml-auto" />
            </div>
            <h1 className="display-lg mt-4 text-balance">{data.name}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {data.plain_summary}
            </p>

            <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
              {[
                {
                  icon: MapPin,
                  label: "Where",
                  value: [data.district, data.state].filter(Boolean).join(", ") || "India",
                },
                {
                  icon: Building2,
                  label: "Responsible body",
                  value: data.department ?? "Not listed",
                },
                {
                  icon: IndianRupee,
                  label: "Money set aside",
                  value: formatBudget(data.budget_inr),
                },
              ].map((item) => (
                <div key={item.label} className="bg-surface p-4">
                  <dt className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                    <item.icon className="size-3.5" aria-hidden />
                    {item.label}
                  </dt>
                  <dd data-numeric className="mt-2 text-sm font-medium leading-snug">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-xs text-muted-foreground">
              Last checked against official records on {formatDate(data.last_verified_at)}.
            </p>
          </header>

          {data.details ? (
            <section className="border-t border-border pt-5">
              <h2 className="display-md">What this project is</h2>
              <p className="mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-muted-foreground">
                {data.details}
              </p>
            </section>
          ) : null}

          <VerifiedTimeline project={data} milestones={milestones.data ?? []} />

          <EvidencePanel sources={sources.data ?? []} loading={sources.isLoading} />
        </div>

        <div className="mt-8 lg:mt-0">
          <CommunitySection projectId={projectId} />
        </div>
      </article>
    </AppShell>
  );
}
