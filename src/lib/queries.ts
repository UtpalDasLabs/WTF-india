import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  ModerationState,
  ProjectStatus,
  SourceType,
  VerifyStatus,
} from "@/lib/wtf";

export type Project = {
  id: string;
  name: string;
  plain_summary: string;
  details: string | null;
  department: string | null;
  sector: string | null;
  state: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  budget_inr: number | null;
  status: ProjectStatus;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  verification_status: VerifyStatus;
  confidence: number;
  last_verified_at: string | null;
  published: boolean;
};

export type ProjectSource = {
  id: string;
  project_id: string;
  title: string;
  url: string;
  publisher: string | null;
  source_type: SourceType;
  verification_status: VerifyStatus;
  confidence: number;
  last_verified_at: string | null;
  extracted_evidence: string | null;
};

export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  is_verified: boolean;
  sort_order: number;
};

export type Review = {
  id: string;
  project_id: string;
  user_id: string | null;
  author_name: string | null;
  rating: number;
  body: string | null;
  masked_body: string | null;
  moderation_label: string | null;
  moderation_state: ModerationState;
  moderation_notes: string | null;
  is_anonymous?: boolean;
  created_at: string;
};

export type ReviewImage = {
  id: string;
  review_id: string;
  image_url: string;
  caption: string | null;
  moderation_label: string | null;
  moderation_state: ModerationState;
};

export type CandidateProject = {
  id: string;
  name: string;
  plain_summary: string | null;
  department: string | null;
  state: string | null;
  district: string | null;
  proposed_status: ProjectStatus | null;
  budget_inr: number | null;
  citations: Array<{
    title: string;
    url: string;
    source_type: SourceType;
    evidence: string;
  }>;
  agent_confidence: number;
  agent_notes: string | null;
  discovered_from: string | null;
  review_state: "discovered" | "in_review" | "approved" | "rejected";
  reviewer_notes: string | null;
  published_project_id: string | null;
  created_at: string;
};

const db = supabase as unknown as {
  from: (table: string) => any;
};

export const projectsQuery = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await db
        .from("projects")
        .select("*")
        .order("last_verified_at", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Project[];
    },
  });

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await db
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Project | null;
    },
  });

export const sourcesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["sources", projectId],
    queryFn: async (): Promise<ProjectSource[]> => {
      const { data, error } = await db
        .from("project_sources")
        .select("*")
        .eq("project_id", projectId)
        .order("confidence", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectSource[];
    },
  });

export const milestonesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["milestones", projectId],
    queryFn: async (): Promise<Milestone[]> => {
      const { data, error } = await db
        .from("project_milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Milestone[];
    },
  });

/** Public review list. Reads the masked public view, so anonymous authors stay hidden. */
export const reviewsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["reviews", projectId],
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await db
        .from("reviews_public")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Review[];
    },
  });

/** The signed-in person's own review for a project, including held content. */
export const myReviewQuery = (projectId: string, userId: string | null) =>
  queryOptions({
    queryKey: ["my-review", projectId, userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Review | null> => {
      if (!userId) return null;
      const { data, error } = await db
        .from("reviews")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Review | null;
    },
  });

export const reviewImagesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["review-images", projectId],
    queryFn: async (): Promise<ReviewImage[]> => {
      const { data: reviewRows, error: reviewError } = await db
        .from("reviews_public")
        .select("id")
        .eq("project_id", projectId);
      if (reviewError) throw new Error(reviewError.message);
      const ids = (reviewRows ?? []).map((row: { id: string }) => row.id);
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("review_images_public")
        .select("*")
        .in("review_id", ids);
      if (error) throw new Error(error.message);
      return (data ?? []) as ReviewImage[];
    },
  });

/** Photos on the signed-in person's own review, including ones still being checked. */
export const myReviewImagesQuery = (reviewId: string | null) =>
  queryOptions({
    queryKey: ["my-review-images", reviewId],
    enabled: Boolean(reviewId),
    queryFn: async (): Promise<ReviewImage[]> => {
      if (!reviewId) return [];
      const { data, error } = await db
        .from("review_images")
        .select("*")
        .eq("review_id", reviewId);
      if (error) throw new Error(error.message);
      return (data ?? []) as ReviewImage[];
    },
  });

export const candidatesQuery = () =>
  queryOptions({
    queryKey: ["candidates"],
    queryFn: async (): Promise<CandidateProject[]> => {
      const { data, error } = await db
        .from("candidate_projects")
        .select("*")
        .order("agent_confidence", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CandidateProject[];
    },
  });

export const moderationQueueQuery = () =>
  queryOptions({
    queryKey: ["moderation-queue"],
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await db
        .from("reviews")
        .select("*")
        .neq("moderation_state", "visible")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Review[];
    },
  });

export async function averageRating(projectId: string) {
  const { data } = await db
    .from("reviews_public")
    .select("rating")
    .eq("project_id", projectId);
  const rows = (data ?? []) as Array<{ rating: number }>;
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
}

export const ratingsQuery = () =>
  queryOptions({
    queryKey: ["ratings"],
    queryFn: async (): Promise<Record<string, { avg: number; count: number }>> => {
      const { data, error } = await db
        .from("reviews_public")
        .select("project_id, rating, moderation_state");
      if (error) throw new Error(error.message);
      const map: Record<string, { total: number; count: number }> = {};
      for (const row of (data ?? []) as Array<{
        project_id: string;
        rating: number;
        moderation_state: ModerationState;
      }>) {
        if (row.moderation_state !== "visible") continue;
        map[row.project_id] ??= { total: 0, count: 0 };
        map[row.project_id]!.total += row.rating;
        map[row.project_id]!.count += 1;
      }
      return Object.fromEntries(
        Object.entries(map).map(([id, value]) => [
          id,
          { avg: value.total / value.count, count: value.count },
        ]),
      );
    },
  });

export { db as wtfDb };
