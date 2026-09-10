import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ModerationState, ProjectStatus, SourceType, VerifyStatus } from "@/lib/wtf";

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
  source_origin?: "official" | "community";
  community_note?: string | null;
  /** What the sanction order first said it would cost, and what it says now. */
  original_cost_inr?: number | null;
  revised_cost_inr?: number | null;
  original_end_date?: string | null;
  revised_end_date?: string | null;
  time_overrun_months?: number | null;
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
  user_id?: string | null;
  author_name: string | null;
  rating: number;
  body: string | null;
  masked_body: string | null;
  moderation_label: string | null;
  moderation_state: ModerationState;
  moderation_notes: string | null;
  is_anonymous?: boolean;
  condition?: "good" | "mixed" | "poor" | null;
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

export type CandidatePhoto = {
  url: string;
  caption: string | null;
  moderation_state: ModerationState;
  moderation_label: string | null;
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
  origin: "agent" | "community";
  submitted_by: string | null;
  submitter_name: string | null;
  is_anonymous: boolean;
  category: string | null;
  location_text: string | null;
  observed_condition: string | null;
  completion_date: string | null;
  approximate_date_note: string | null;
  photos: CandidatePhoto[];
  moderation_label: string | null;
  moderation_state: ModerationState;
  moderation_notes: string | null;
};

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: Blob,
        options?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

/**
 * Every published project, in pages.
 *
 * PostgREST caps a response at 1,000 rows, and with the MoSPI import there are
 * more projects than that. An unpaged select would come back truncated with no
 * error at all — the map would quietly be missing a third of the country, which
 * is a worse failure than not loading, because nothing on screen looks wrong.
 */
const PAGE_SIZE = 1000;

export const projectsQuery = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const all: Project[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
          .from("projects")
          .select("*")
          .order("last_verified_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as Project[];
        all.push(...page);
        // A short page is the last page.
        if (page.length < PAGE_SIZE) return all;
      }
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
      const { data, error } = await db.from("review_images").select("*").eq("review_id", reviewId);
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
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CandidateProject[];
    },
  });

/** The signed-in person's own community submissions, including held ones. */
export const mySubmissionsQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["my-submissions", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<CandidateProject[]> => {
      if (!userId) return [];
      const { data, error } = await db
        .from("candidate_projects")
        .select("*")
        .eq("submitted_by", userId)
        .order("created_at", { ascending: false });
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
  const { data } = await db.from("reviews_public").select("rating").eq("project_id", projectId);
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

/** The four ways a reader can react. Stored as names so the glyphs can change. */
export const REACTIONS = ["facepalm", "doubt", "outrage", "again"] as const;
export type Reaction = (typeof REACTIONS)[number];

export type ReactionCounts = Record<string, Partial<Record<Reaction, number>>>;

/**
 * Reaction totals for every project, read from a view that never exposes who
 * reacted. One query for the whole page rather than one per row.
 */
export const reactionsQuery = () =>
  queryOptions({
    queryKey: ["reactions"],
    queryFn: async (): Promise<ReactionCounts> => {
      const { data, error } = await db
        .from("project_reaction_counts")
        .select("project_id, reaction, total");
      if (error) throw new Error(error.message);
      const counts: ReactionCounts = {};
      for (const row of (data ?? []) as Array<{
        project_id: string;
        reaction: Reaction;
        total: number;
      }>) {
        counts[row.project_id] ??= {};
        counts[row.project_id]![row.reaction] = row.total;
      }
      return counts;
    },
  });

/** Toggles one reaction and reports whether it is now on. */
export async function toggleReaction(projectId: string, reaction: Reaction, voter: string) {
  const { data, error } = await db.rpc("toggle_reaction", {
    _project: projectId,
    _reaction: reaction,
    _voter: voter,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/* -------------------------------------------------------------------------
 * The community layer
 *
 * Everything below is written by readers, not by a government document, and is
 * kept in its own tables and its own queries so the two can never be confused
 * on screen. Nothing here carries a device id: the server hands back a derived
 * handle instead, so there is no id on the wire to harvest.
 * ---------------------------------------------------------------------- */

export const PHOTO_BUCKET = "community-photos";

export type Post = {
  id: string;
  project_id: string;
  kind: "photo" | "comment";
  body: string | null;
  photo_path: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string | null;
  created_at: string;
  flag_count: number;
  handle: string;
};

export type CommunityNote = {
  id: string;
  post_id: string;
  body: string;
  source_url: string | null;
  created_at: string;
  handle: string;
  helpful: number;
  not_helpful: number;
  /** True once enough readers have judged the note and most found it helpful. */
  shown: boolean;
};

export type PostCounts = Record<string, { total: number; photos: number; latest: string | null }>;

/** A storage path turned into something an <img> can load. */
export function photoUrl(path: string): string {
  return db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const postsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["posts", projectId],
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await db
        .from("project_posts_public")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Post[];
    },
  });

/** How much has been said about every project, for a feed that cannot ask per card. */
export const postCountsQuery = () =>
  queryOptions({
    queryKey: ["post-counts"],
    queryFn: async (): Promise<PostCounts> => {
      const { data, error } = await db
        .from("project_post_counts")
        .select("project_id, total, photos, latest");
      if (error) throw new Error(error.message);
      const counts: PostCounts = {};
      for (const row of (data ?? []) as Array<{
        project_id: string;
        total: number;
        photos: number;
        latest: string | null;
      }>) {
        counts[row.project_id] = { total: row.total, photos: row.photos, latest: row.latest };
      }
      return counts;
    },
  });

/**
 * The most recent posts across the whole country, newest first.
 *
 * The feed needs these twice over: a photograph becomes the card art for its
 * project, and any post near the reader becomes a card in its own right. What
 * somebody photographed down the road this morning is the most current thing
 * the app knows, and it should not be reduced to a number on somebody else's
 * card.
 */
export const recentPostsQuery = (limit = 400) =>
  queryOptions({
    queryKey: ["recent-posts", limit],
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await db
        .from("project_posts_public")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as Post[];
    },
  });

export const notesQuery = (postIds: string[]) =>
  queryOptions({
    queryKey: ["notes", [...postIds].sort().join(",")],
    enabled: postIds.length > 0,
    queryFn: async (): Promise<Record<string, CommunityNote[]>> => {
      if (postIds.length === 0) return {};
      const { data, error } = await db
        .from("community_notes_public")
        .select("*")
        .in("post_id", postIds);
      if (error) throw new Error(error.message);
      const byPost: Record<string, CommunityNote[]> = {};
      for (const note of (data ?? []) as CommunityNote[]) {
        (byPost[note.post_id] ??= []).push(note);
      }
      // A shown note outranks a proposed one; within each, the more helpful wins.
      for (const list of Object.values(byPost)) {
        list.sort((a, b) => Number(b.shown) - Number(a.shown) || b.helpful - a.helpful);
      }
      return byPost;
    },
  });

/** The pseudonym the server will show next to anything this device writes. */
export async function myHandle(device: string): Promise<string> {
  const { data, error } = await db.rpc("handle_for", { _device: device });
  if (error) throw new Error(error.message);
  return String(data ?? "");
}

/**
 * About 100 m. Enough to put a photograph on the right road, not enough to put
 * it at somebody's door.
 *
 * The database rounds too, and would be right to: it cannot trust a client. But
 * rounding here as well means the precise fix never leaves the phone at all,
 * which is what the warning shown before the camera opens actually promises.
 */
function coarse(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

export async function createPost(input: {
  projectId: string;
  kind: "photo" | "comment";
  device: string;
  body?: string | null;
  photoPath?: string | null;
  lat?: number | null;
  lng?: number | null;
  takenAt?: string | null;
}): Promise<string> {
  const { data, error } = await db.rpc("create_post", {
    _project: input.projectId,
    _kind: input.kind,
    _device: input.device,
    _body: input.body ?? null,
    _photo_path: input.photoPath ?? null,
    _lat: coarse(input.lat),
    _lng: coarse(input.lng),
    _taken_at: input.takenAt ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function deleteOwnPost(postId: string, device: string): Promise<boolean> {
  const { data, error } = await db.rpc("delete_own_post", { _post: postId, _device: device });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Returns how many devices have now flagged the post. */
export async function flagPost(postId: string, device: string, reason?: string): Promise<number> {
  const { data, error } = await db.rpc("flag_post", {
    _post: postId,
    _device: device,
    _reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function addNote(input: {
  postId: string;
  device: string;
  body: string;
  sourceUrl?: string | null;
}): Promise<string> {
  const { data, error } = await db.rpc("add_note", {
    _post: input.postId,
    _device: input.device,
    _body: input.body,
    _source_url: input.sourceUrl ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function rateNote(noteId: string, device: string, helpful: boolean): Promise<void> {
  const { error } = await db.rpc("rate_note", {
    _note: noteId,
    _device: device,
    _helpful: helpful,
  });
  if (error) throw new Error(error.message);
}

/**
 * A place somebody photographed that we were not already tracking.
 *
 * It lands in the projects table marked `community`, with no money figure and a
 * status that says outright nobody has checked it, so it can never be mistaken
 * for a row that came out of a sanction order.
 */
export async function createCommunitySpot(input: {
  device: string;
  name: string;
  summary?: string | null;
  lat: number;
  lng: number;
  state?: string | null;
  district?: string | null;
}): Promise<string> {
  const { data, error } = await db.rpc("create_community_spot", {
    _device: input.device,
    _name: input.name,
    _summary: input.summary ?? null,
    _lat: coarse(input.lat),
    _lng: coarse(input.lng),
    _state: input.state ?? null,
    _district: input.district ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Uploads a photograph and returns its storage path. */
export async function uploadPhoto(projectHint: string, file: Blob): Promise<string> {
  const extension = file.type === "image/webp" ? "webp" : "jpg";
  const path = `${projectHint}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/* -------------------------------------------------------------------------
 * The reviewer's view of the community layer
 *
 * These read the tables themselves rather than the public views, which is only
 * possible for an account holding a reviewer role — the policies behind them are
 * false for everybody else, so an ordinary signed-in reader gets an empty result
 * rather than somebody's device id.
 * ---------------------------------------------------------------------- */

export type FlaggedPost = Post & {
  device_id: string;
  state: "visible" | "hidden";
  project?: { name: string } | null;
};

/** Everything a reader has objected to, plus everything already taken down. */
export const flaggedPostsQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: ["flagged-posts"],
    enabled,
    queryFn: async (): Promise<FlaggedPost[]> => {
      const { data, error } = await db
        .from("project_posts")
        .select("*, project:projects(name)")
        .or("flag_count.gt.0,state.eq.hidden")
        .order("flag_count", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FlaggedPost[];
    },
  });

/** Takes a post down, or puts it back. */
export async function setPostState(postId: string, state: "visible" | "hidden") {
  const { error } = await db.from("project_posts").update({ state }).eq("id", postId);
  if (error) throw new Error(error.message);
}

/**
 * Clearing the flags is how a reviewer says "this one is fine". Without it the
 * count would immediately hide the post again the next time anybody objected.
 */
export async function clearPostFlags(postId: string) {
  const { error: flagError } = await db.from("post_flags").delete().eq("post_id", postId);
  if (flagError) throw new Error(flagError.message);
  const { error } = await db
    .from("project_posts")
    .update({ flag_count: 0, state: "visible" })
    .eq("id", postId);
  if (error) throw new Error(error.message);
}

export async function removePost(postId: string) {
  const { error } = await db.from("project_posts").delete().eq("id", postId);
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------------------
 * Reporting
 *
 * Headlines only, written by a scheduled job and never by a reader. Nothing
 * here is the app's own claim: the row is a pointer at somebody else's work,
 * and the app's job is to say who wrote it and get out of the way.
 * ---------------------------------------------------------------------- */

export type NewsItem = {
  id: string;
  url: string;
  title: string;
  publisher: string | null;
  published_at: string;
  state: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  topic: string | null;
};

export const newsQuery = () =>
  queryOptions({
    queryKey: ["news"],
    // Four ingest runs a day, so re-asking every few minutes is wasted breath.
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<NewsItem[]> => {
      const { data, error } = await db
        .from("news_items")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as NewsItem[];
    },
  });

/* -------------------------------------------------------------------------
 * Your own history
 *
 * Keyed to the device, not the account, because that is how everything in the
 * community layer works: you can react, post, photograph and write notes
 * without ever signing in, and the record of it has to be readable the same
 * way. Hand the function your own device id and it hands back your own history
 * — a device id is a random UUID the server never gives out, so knowing one
 * means it is yours.
 * ---------------------------------------------------------------------- */

export type ActivityKind = "photo" | "comment" | "note" | "reaction" | "spot";

export type Activity = {
  kind: ActivityKind;
  happened_at: string;
  project_id: string;
  project_name: string;
  detail: string;
  post_id: string | null;
};

export const activityQuery = (device: string | null) =>
  queryOptions({
    queryKey: ["activity", device],
    enabled: Boolean(device),
    queryFn: async (): Promise<Activity[]> => {
      if (!device) return [];
      const { data, error } = await db.rpc("my_activity", { _device: device });
      if (error) throw new Error(error.message);
      return (data ?? []) as Activity[];
    },
  });

/* -------------------------------------------------------------------------
 * Following
 *
 * The browser keeps its own list so the button answers instantly and offline;
 * the database keeps the same list so the button can say how many other people
 * are watching. A count that only counts you is not a count.
 * ---------------------------------------------------------------------- */

export type FollowCounts = Record<string, number>;

export const followCountsQuery = () =>
  queryOptions({
    queryKey: ["follow-counts"],
    queryFn: async (): Promise<FollowCounts> => {
      const { data, error } = await db.from("project_follow_counts").select("project_id, total");
      if (error) throw new Error(error.message);
      const counts: FollowCounts = {};
      for (const row of (data ?? []) as Array<{ project_id: string; total: number }>) {
        counts[row.project_id] = row.total;
      }
      return counts;
    },
  });

/** Toggles a follow and reports whether it is now on. */
export async function toggleFollow(projectId: string, device: string): Promise<boolean> {
  const { data, error } = await db.rpc("toggle_follow", {
    _project: projectId,
    _device: device,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** What this device already follows, for a browser that has lost its copy. */
export async function myFollows(device: string): Promise<string[]> {
  const { data, error } = await db.rpc("my_follows", { _device: device });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<string | { my_follows: string }>).map((row) =>
    typeof row === "string" ? row : row.my_follows,
  );
}

/**
 * The posts this device wrote, so the delete button appears wherever it should.
 *
 * The app used to keep this list in localStorage, which missed every photograph
 * taken through the camera and lost everything when the browser was cleared.
 * The server has always known; it just was not asked.
 */
export const myPostIdsQuery = (device: string | null) =>
  queryOptions({
    queryKey: ["my-post-ids", device],
    enabled: Boolean(device),
    queryFn: async (): Promise<string[]> => {
      if (!device) return [];
      const { data, error } = await db.rpc("my_post_ids", { _device: device });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<string | { my_post_ids: string }>).map((row) =>
        typeof row === "string" ? row : row.my_post_ids,
      );
    },
  });

/**
 * Attaches this browser's unclaimed activity to the account that just signed in
 * — posts, reactions, follows and notes alike.
 *
 * Only rows with no account yet, and only from the device asking, so signing in
 * can never take over somebody else's. Anything that would collide with what
 * the account already has from another browser is left where it is. Returns how
 * many rows were adopted.
 */
export async function claimActivity(device: string): Promise<number> {
  const { data, error } = await db.rpc("claim_activity", { _device: device });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * The reactions this device or account has already given.
 *
 * Same lesson as the delete button: the browser's own list misses everything
 * given on another device, so the faces came up dark for somebody who had
 * already tapped them.
 */
export async function myReactions(device: string): Promise<string[]> {
  const { data, error } = await db.rpc("my_reactions", { _device: device });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ project_id: string; reaction: string }>).map(
    (row) => `${row.project_id}:${row.reaction}`,
  );
}
