import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Bot,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/wtf/app-shell";
import { StatusChip, VerificationChip } from "@/components/wtf/status-chip";
import { useSession } from "@/hooks/use-session";
import { runResearchAgent } from "@/lib/agent.functions";
import { MODERATION_STATE_LABEL } from "@/lib/moderation";
import {
  candidatesQuery,
  moderationQueueQuery,
  projectsQuery,
  wtfDb,
} from "@/lib/queries";
import { SOURCE_TYPE_LABEL, confidencePercent, formatDate } from "@/lib/wtf";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Reviewer desk — We the Future" },
      {
        name: "description",
        content:
          "Reviewer workspace for We the Future: check agent-discovered projects and their citations, publish verified projects, and act on flagged reviews and photos.",
      },
      { property: "og:title", content: "Reviewer desk — We the Future" },
      {
        property: "og:description",
        content:
          "Verify candidate government projects with citations before publishing, and moderate community content.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const candidates = useQuery(candidatesQuery());
  const flagged = useQuery(moderationQueueQuery());
  const projects = useQuery(projectsQuery());
  const [focus, setFocus] = useState("Metro rail projects in Tamil Nadu");
  const agent = useServerFn(runResearchAgent);

  const invalidate = (keys: string[]) =>
    keys.forEach((key) => void queryClient.invalidateQueries({ queryKey: [key] }));

  const runAgent = useMutation({
    mutationFn: () => agent({ data: { focus } }),
    onSuccess: (result) => {
      invalidate(["candidates"]);
      toast.success(
        `${result.inserted} candidate${result.inserted === 1 ? "" : "s"} added to the queue.`,
        {
          description:
            result.dropped > 0
              ? `${result.dropped} dropped for missing an official source.`
              : undefined,
        },
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setCandidateState = useMutation({
    mutationFn: async ({
      id,
      state,
    }: {
      id: string;
      state: "discovered" | "in_review" | "approved" | "rejected";
    }) => {
      const { error } = await wtfDb
        .from("candidate_projects")
        .update({ review_state: state, reviewer_id: session.userId })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate(["candidates"]);
      toast.success("Candidate updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publishCandidate = useMutation({
    mutationFn: async (candidateId: string) => {
      const candidate = (candidates.data ?? []).find((item) => item.id === candidateId);
      if (!candidate) throw new Error("Candidate not found.");

      const { data: created, error } = await wtfDb
        .from("projects")
        .insert({
          name: candidate.name,
          plain_summary: candidate.plain_summary ?? candidate.name,
          department: candidate.department,
          state: candidate.state,
          district: candidate.district,
          budget_inr: candidate.budget_inr,
          status: candidate.proposed_status ?? "planned",
          verification_status: "verified",
          confidence: candidate.agent_confidence,
          last_verified_at: new Date().toISOString(),
          published: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const projectId = (created as { id: string }).id;
      if (candidate.citations.length > 0) {
        const { error: sourceError } = await wtfDb.from("project_sources").insert(
          candidate.citations.map((citation) => ({
            project_id: projectId,
            title: citation.title,
            url: citation.url,
            source_type: citation.source_type,
            verification_status: "verified",
            confidence: candidate.agent_confidence,
            last_verified_at: new Date().toISOString(),
            extracted_evidence: citation.evidence,
          })),
        );
        if (sourceError) throw new Error(sourceError.message);
      }

      const { error: updateError } = await wtfDb
        .from("candidate_projects")
        .update({
          review_state: "approved",
          reviewer_id: session.userId,
          published_project_id: projectId,
        })
        .eq("id", candidateId);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      invalidate(["candidates", "projects"]);
      toast.success("Published as a verified project.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /**
   * Community submissions are listed as community-sourced and never as a
   * verified government fact: they go public marked "awaiting reviewer check".
   */
  const publishCommunity = useMutation({
    mutationFn: async (candidateId: string) => {
      const candidate = (candidates.data ?? []).find((item) => item.id === candidateId);
      if (!candidate) throw new Error("Submission not found.");

      const { data: created, error } = await wtfDb
        .from("projects")
        .insert({
          name: candidate.name,
          plain_summary:
            candidate.plain_summary ??
            `Reported by a member of the public in ${candidate.location_text ?? "India"}.`,
          department: candidate.department,
          state: candidate.state,
          district: candidate.district,
          sector: candidate.category,
          status: candidate.completion_date ? "completed" : "ongoing",
          actual_end_date: candidate.completion_date,
          verification_status: "pending_review",
          confidence: 0,
          published: true,
          source_origin: "community",
          community_note: candidate.observed_condition,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const projectId = (created as { id: string }).id;
      const { error: updateError } = await wtfDb
        .from("candidate_projects")
        .update({
          review_state: "approved",
          reviewer_id: session.userId,
          published_project_id: projectId,
        })
        .eq("id", candidateId);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      invalidate(["candidates", "projects", "my-submissions"]);
      toast.success("Listed as a community-reported project awaiting checks.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setReviewState = useMutation({
    mutationFn: async ({
      id,
      state,
    }: {
      id: string;
      state: "visible" | "held" | "blurred" | "removed";
    }) => {
      const { error } = await wtfDb
        .from("reviews")
        .update({ moderation_state: state })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate(["moderation-queue", "reviews", "ratings"]);
      toast.success("Moderation decision saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setProjectVerification = useMutation({
    mutationFn: async ({
      id,
      status,
      published,
    }: {
      id: string;
      status: "unverified" | "pending_review" | "verified" | "rejected";
      published: boolean;
    }) => {
      const { error } = await wtfDb
        .from("projects")
        .update({
          verification_status: status,
          published,
          last_verified_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate(["projects", "project"]);
      toast.success("Project verification updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (session.loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </AppShell>
    );
  }

  if (!session.isReviewer) {
    return (
      <AppShell>
        <div className="rounded-3xl bg-surface-container p-6 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h1 className="mt-3 text-base font-semibold">Reviewer access only</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This desk is for the people who check official records before anything is
            published.
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

  const pendingCandidates = (candidates.data ?? []).filter(
    (candidate) => candidate.review_state !== "approved" && candidate.origin !== "community",
  );
  const communityQueue = (candidates.data ?? []).filter(
    (candidate) => candidate.origin === "community" && candidate.review_state !== "approved",
  );

  return (
    <AppShell>
      <h1 className="text-xl font-semibold">Reviewer desk</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing reaches the public as a verified fact until you approve it here.
      </p>

      <Tabs defaultValue="candidates" className="mt-4">
        <TabsList className="w-full rounded-full bg-surface-container">
          <TabsTrigger value="candidates" className="flex-1 rounded-full">
            Candidates
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex-1 rounded-full">
            Projects
          </TabsTrigger>
          <TabsTrigger value="community" className="flex-1 rounded-full">
            Public ({communityQueue.length})
          </TabsTrigger>
          <TabsTrigger value="moderation" className="flex-1 rounded-full">
            Flagged
          </TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="mt-4 space-y-3">
          <div className="rounded-3xl bg-surface-container-high p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-4" aria-hidden /> Research agent
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The agent searches official portals, keeps every citation and drops
              anything without an official source. Its findings arrive here as
              candidates, never as published facts.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="What should the agent look for?"
                className="rounded-2xl bg-surface-container"
              />
              <Button
                onClick={() => runAgent.mutate()}
                disabled={runAgent.isPending}
                className="rounded-full"
              >
                {runAgent.isPending ? "Researching…" : "Run agent"}
              </Button>
            </div>
          </div>

          {pendingCandidates.length === 0 ? (
            <p className="rounded-3xl bg-surface-container p-4 text-sm text-muted-foreground">
              The queue is empty. Run the agent to look for new projects.
            </p>
          ) : null}

          {pendingCandidates.map((candidate) => (
            <article key={candidate.id} className="rounded-3xl bg-surface-container p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-medium">
                  {candidate.review_state.replaceAll("_", " ")}
                </span>
                <span className="text-muted-foreground">
                  Agent confidence {confidencePercent(candidate.agent_confidence)}
                </span>
              </div>
              <h2 className="mt-2 text-base font-semibold">{candidate.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {candidate.plain_summary}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[candidate.district, candidate.state, candidate.department]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <ul className="mt-3 space-y-2">
                {candidate.citations.map((citation, index) => (
                  <li
                    key={`${candidate.id}-${index}`}
                    className="rounded-2xl bg-surface-container-high p-3 text-sm"
                  >
                    <p className="label-sm text-muted-foreground">
                      {SOURCE_TYPE_LABEL[citation.source_type]}
                    </p>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                    >
                      {citation.title}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      “{citation.evidence}”
                    </p>
                  </li>
                ))}
              </ul>

              {candidate.agent_notes ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Agent note: {candidate.agent_notes}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={publishCandidate.isPending}
                  onClick={() => publishCandidate.mutate(candidate.id)}
                >
                  <BadgeCheck className="mr-1.5 size-4" aria-hidden /> Verify and publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() =>
                    setCandidateState.mutate({ id: candidate.id, state: "in_review" })
                  }
                >
                  Mark in review
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() =>
                    setCandidateState.mutate({ id: candidate.id, state: "rejected" })
                  }
                >
                  Reject
                </Button>
              </div>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="community" className="mt-4 space-y-3">
          <p className="rounded-3xl bg-tertiary-container p-4 text-sm text-tertiary-container-foreground">
            Sent in by members of the public, often about older work that records
            already closed. Listing one shows it as community-reported and awaiting a
            check — never as a verified government fact.
          </p>

          {communityQueue.length === 0 ? (
            <p className="rounded-3xl bg-surface-container p-4 text-sm text-muted-foreground">
              Nothing waiting from the public right now.
            </p>
          ) : null}

          {communityQueue.map((candidate) => (
            <article key={candidate.id} className="rounded-3xl bg-surface-container p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 font-medium">
                  <Users className="size-3" aria-hidden />
                  {candidate.review_state.replaceAll("_", " ")}
                </span>
                {candidate.moderation_state !== "visible" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container px-2 py-0.5 text-tertiary-container-foreground">
                    <ShieldAlert className="size-3" aria-hidden />
                    {MODERATION_STATE_LABEL[candidate.moderation_state]}
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {candidate.is_anonymous
                    ? "Anonymous in public"
                    : (candidate.submitter_name ?? "Community member")}{" "}
                  · {formatDate(candidate.created_at)}
                </span>
              </div>

              <h2 className="mt-2 text-base font-semibold">{candidate.name}</h2>
              <p className="text-xs text-muted-foreground">
                {[candidate.category, candidate.location_text, candidate.district, candidate.state]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {candidate.plain_summary ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {candidate.plain_summary}
                </p>
              ) : null}

              {candidate.observed_condition ? (
                <div className="mt-2 rounded-2xl bg-surface-container-high p-3">
                  <p className="label-sm text-muted-foreground">Condition reported</p>
                  <p className="mt-1 text-sm">{candidate.observed_condition}</p>
                </div>
              ) : null}

              <p className="mt-2 text-xs text-muted-foreground">
                Said to be finished:{" "}
                {candidate.completion_date
                  ? formatDate(candidate.completion_date)
                  : (candidate.approximate_date_note ?? "Not given")}
              </p>

              {candidate.citations.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {candidate.citations.map((citation, index) => (
                    <li key={`${candidate.id}-c-${index}`} className="text-sm">
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                      >
                        Link shared by the submitter
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {candidate.photos.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {candidate.photos
                    .filter((photo) => photo.moderation_state !== "removed")
                    .map((photo, index) => (
                      <figure
                        key={`${candidate.id}-p-${index}`}
                        className="overflow-hidden rounded-2xl bg-surface-container-highest"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption ?? "Photo sent with this submission"}
                          loading="lazy"
                          className="h-28 w-full object-cover"
                        />
                        <figcaption className="p-2 text-xs text-muted-foreground">
                          {MODERATION_STATE_LABEL[photo.moderation_state]}
                          {photo.caption ? ` · ${photo.caption}` : ""}
                        </figcaption>
                      </figure>
                    ))}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={publishCommunity.isPending}
                  onClick={() => publishCommunity.mutate(candidate.id)}
                >
                  <BadgeCheck className="mr-1.5 size-4" aria-hidden /> List as
                  community-reported
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() =>
                    setCandidateState.mutate({ id: candidate.id, state: "in_review" })
                  }
                >
                  Mark in review
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() =>
                    setCandidateState.mutate({ id: candidate.id, state: "rejected" })
                  }
                >
                  Reject
                </Button>
              </div>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="projects" className="mt-4 space-y-3">
          {(projects.data ?? []).map((project) => (
            <article key={project.id} className="rounded-3xl bg-surface-container p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={project.status} />
                <VerificationChip
                  status={project.verification_status}
                  confidence={project.confidence}
                />
                <span className="text-xs text-muted-foreground">
                  {project.published ? "Public" : "Hidden from public"}
                </span>
              </div>
              <h2 className="mt-2 text-sm font-semibold">{project.name}</h2>
              <p className="text-xs text-muted-foreground">
                Last checked {formatDate(project.last_verified_at)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() =>
                    setProjectVerification.mutate({
                      id: project.id,
                      status: "verified",
                      published: true,
                    })
                  }
                >
                  Verified and public
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() =>
                    setProjectVerification.mutate({
                      id: project.id,
                      status: "pending_review",
                      published: true,
                    })
                  }
                >
                  Needs another check
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() =>
                    setProjectVerification.mutate({
                      id: project.id,
                      status: "rejected",
                      published: false,
                    })
                  }
                >
                  Take down
                </Button>
              </div>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="moderation" className="mt-4 space-y-3">
          {(flagged.data ?? []).length === 0 ? (
            <p className="rounded-3xl bg-surface-container p-4 text-sm text-muted-foreground">
              Nothing is waiting. Flagged reviews and photos appear here.
            </p>
          ) : null}
          {(flagged.data ?? []).map((review) => (
            <article key={review.id} className="rounded-3xl bg-surface-container p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container px-2 py-0.5 text-tertiary-container-foreground">
                  <ShieldAlert className="size-3" aria-hidden />
                  {review.moderation_label?.replaceAll("_", " ") ?? "flagged"}
                </span>
                <span className="text-muted-foreground">
                  {MODERATION_STATE_LABEL[review.moderation_state]} ·{" "}
                  {formatDate(review.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm">{review.masked_body ?? review.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Account: {review.author_name ?? "Unknown"}
                {review.is_anonymous
                  ? " · posted anonymously in public (shown as “Verified local resident”)"
                  : ""}
              </p>
              {review.moderation_notes ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Why it was flagged: {review.moderation_notes}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => setReviewState.mutate({ id: review.id, state: "visible" })}
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setReviewState.mutate({ id: review.id, state: "blurred" })}
                >
                  Blur
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setReviewState.mutate({ id: review.id, state: "removed" })}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
