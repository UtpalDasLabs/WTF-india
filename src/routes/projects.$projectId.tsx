import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, IndianRupee, MapPin } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/wtf/app-shell";
import { CommunitySection } from "@/components/wtf/community-section";
import { EvidencePanel } from "@/components/wtf/evidence-panel";
import { StatusChip, VerificationChip } from "@/components/wtf/status-chip";
import { VerifiedTimeline } from "@/components/wtf/timeline";
import { milestonesQuery, projectQuery, sourcesQuery } from "@/lib/queries";
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
  component: ProjectDetail;
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const project = useQuery(projectQuery(projectId));
  const sources = useQuery(sourcesQuery(projectId));
  const milestones = useQuery(milestonesQuery(projectId));

  if (project.isLoading) {
    return (
      <AppShell>
        <div className="space-y-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-60 rounded-3xl" />
        </div>
      </AppShell>
    );
  }

  if (!project.data) {
    return (
      <AppShell>
        <div className="rounded-3xl bg-surface-container p-6 text-center">
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

  return (
    <AppShell>
      <Link
        to="/"
        className="m3-state inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All projects
      </Link>

      <article className="mt-3 space-y-4">
        <header className="rounded-3xl bg-surface-container p-4 shadow-e1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={data.status} />
            <VerificationChip
              status={data.verification_status}
              confidence={data.confidence}
            />
          </div>
          <h1 className="mt-3 text-xl font-semibold leading-snug">{data.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{data.plain_summary}</p>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Location</dt>
              <dd>{[data.district, data.state].filter(Boolean).join(", ") || "India"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Department</dt>
              <dd>{data.department ?? "Department not listed"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <IndianRupee className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Budget</dt>
              <dd>{formatBudget(data.budget_inr)} set aside</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-muted-foreground">
            Last checked against official records on {formatDate(data.last_verified_at)}.
          </p>
        </header>

        {data.details ? (
          <section className="rounded-3xl bg-surface-container p-4">
            <h2 className="text-base font-semibold">What this project is</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {data.details}
            </p>
          </section>
        ) : null}

        <VerifiedTimeline project={data} milestones={milestones.data ?? []} />

        <EvidencePanel sources={sources.data ?? []} loading={sources.isLoading} />

        <CommunitySection projectId={projectId} />
      </article>
    </AppShell>
  );
}
