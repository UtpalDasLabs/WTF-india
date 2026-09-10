import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Flag,
  Loader2,
  MessageSquare,
  Send,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Capture } from "@/components/wtf/capture";
import { deviceId, useDeviceId } from "@/hooks/use-device-id";
import {
  addNote,
  createPost,
  deleteOwnPost,
  flagPost,
  myPostIdsQuery,
  notesQuery,
  photoUrl,
  postsQuery,
  rateNote,
  type CommunityNote,
  type Post,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Everything readers have said about one project.
 *
 * Deliberately not the same surface as the official record above it: posts are
 * live the moment they are written, carry a pseudonym rather than a name, and
 * can be contested in public. A note does not remove a post — it stands next to
 * it — because a photograph that is real but three years old is not a lie to
 * delete, it is a claim that needs a date attached.
 */

/**
 * Posts written on this browser before the server has been asked.
 *
 * Only a head start: the authority on what is yours is `my_post_ids`, which
 * knows about photographs taken through the camera and survives a cleared
 * browser. This exists so the delete button appears the instant you post
 * rather than one refetch later.
 */
const MINE_KEY = "wtf.myposts";

function readMine(): Set<string> {
  try {
    const raw = window.localStorage.getItem(MINE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberMine(id: string, keep: boolean) {
  try {
    const mine = readMine();
    if (keep) mine.add(id);
    else mine.delete(id);
    window.localStorage.setItem(MINE_KEY, JSON.stringify([...mine].slice(-500)));
  } catch {
    // Storage blocked. The server still knows, which is the point.
  }
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d ago`;
  const months = days / 30.44;
  if (months < 12) return `${Math.round(months)}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function NoteBlock({ note, onRate }: { note: CommunityNote; onRate: (helpful: boolean) => void }) {
  return (
    <div
      className={cn(
        "mt-2 rounded-xl border p-3 text-sm leading-relaxed",
        note.shown
          ? "border-outline-variant bg-surface-container-high"
          : "border-dashed border-outline-variant bg-transparent",
      )}
    >
      <p className="eyebrow flex items-center gap-1.5 text-muted-foreground">
        <StickyNote className="size-3.5" aria-hidden />
        {note.shown ? "Readers added context" : "Proposed note — not shown yet"}
      </p>
      <p className="mt-1.5">{note.body}</p>
      {note.source_url ? (
        <a
          href={note.source_url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1.5 inline-block break-all text-xs underline underline-offset-2"
        >
          {note.source_url}
        </a>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Is this helpful?</span>
        <button
          type="button"
          onClick={() => onRate(true)}
          className="m3-state inline-flex items-center gap-1 rounded-full border border-outline-variant px-2 py-1 hover:bg-surface-container-highest"
        >
          <ThumbsUp className="size-3" aria-hidden /> {note.helpful}
        </button>
        <button
          type="button"
          onClick={() => onRate(false)}
          className="m3-state inline-flex items-center gap-1 rounded-full border border-outline-variant px-2 py-1 hover:bg-surface-container-highest"
        >
          <ThumbsDown className="size-3" aria-hidden /> {note.not_helpful}
        </button>
      </div>
    </div>
  );
}

function PostRow({
  post,
  notes,
  mine,
  onFlag,
  onDelete,
  onNote,
  onRateNote,
}: {
  post: Post;
  notes: CommunityNote[];
  mine: boolean;
  onFlag: () => void;
  onDelete: () => void;
  onNote: (body: string) => void;
  onRateNote: (noteId: string, helpful: boolean) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <li className="border-b border-border py-4 last:border-b-0">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{post.handle}</span>
        <span aria-hidden>·</span>
        <span>{timeAgo(post.created_at)}</span>
        {post.taken_at ? (
          <>
            <span aria-hidden>·</span>
            <span>taken {timeAgo(post.taken_at)}</span>
          </>
        ) : null}
      </p>

      {post.photo_path ? (
        <img
          src={photoUrl(post.photo_path)}
          alt={post.body ?? "Photo posted by a reader"}
          loading="lazy"
          className="mt-2 max-h-80 w-full rounded-xl bg-surface-container-highest object-cover"
        />
      ) : null}

      {post.body ? <p className="mt-2 text-sm leading-relaxed">{post.body}</p> : null}

      {notes.map((note) => (
        <NoteBlock key={note.id} note={note} onRate={(helpful) => onRateNote(note.id, helpful)} />
      ))}

      {writing ? (
        <div className="mt-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add what other readers are missing — a date, a link, what actually happened here."
            className="min-h-20 text-sm"
            maxLength={1000}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={draft.trim().length < 10}
              onClick={() => {
                onNote(draft.trim());
                setDraft("");
                setWriting(false);
              }}
              className="m3-state rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
            >
              Propose note
            </button>
            <button
              type="button"
              onClick={() => setWriting(false)}
              className="m3-state rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <StickyNote className="size-3.5" aria-hidden /> Add a note
          </button>
          <button
            type="button"
            onClick={onFlag}
            className="inline-flex items-center gap-1 hover:text-status-delayed"
          >
            <Flag className="size-3.5" aria-hidden /> Flag
          </button>
          {mine ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 hover:text-status-delayed"
            >
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}

/**
 * The thread itself, without a container.
 *
 * The feed shows it in a sheet over a card; a project's own page shows it inline
 * under the official record. Same conversation either way, so it is written once
 * and the two callers decide what it sits in.
 */
export function PostsThread({
  projectId,
  enabled = true,
}: {
  projectId: string;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const device = useDeviceId();
  const posts = useQuery({ ...postsQuery(projectId), enabled });
  const myIds = useQuery({ ...myPostIdsQuery(device), enabled: enabled && Boolean(device) });
  const postIds = useMemo(() => (posts.data ?? []).map((post) => post.id), [posts.data]);
  const notes = useQuery({ ...notesQuery(postIds), enabled: enabled && postIds.length > 0 });

  const [draft, setDraft] = useState("");
  const [justMine, setJustMine] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readMine(),
  );
  // Whatever the server says is yours, plus anything posted a moment ago that
  // it has not been asked about yet.
  const mine = useMemo(() => new Set([...(myIds.data ?? []), ...justMine]), [myIds.data, justMine]);
  const [capturing, setCapturing] = useState(false);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["posts", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["post-counts"] }),
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["my-post-ids"] }),
    ]);
  }, [queryClient, projectId]);

  const say = useMutation({
    mutationFn: async (body: string) => {
      const id = deviceId();
      if (!id) throw new Error("This browser will not let us keep an identity for you.");
      return createPost({ projectId, kind: "comment", device: id, body });
    },
    onSuccess: async (id) => {
      rememberMine(id, true);
      setJustMine((current) => new Set(current).add(id));
      setDraft("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const act = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const run = (job: () => Promise<unknown>) => act.mutate(job);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {posts.isLoading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (posts.data ?? []).length === 0 ? (
            <div className="py-10 text-center">
              <MessageSquare className="mx-auto size-7 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-semibold">Nobody has said anything yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                If you have walked past this, you know more about it than anyone reading.
              </p>
              <button
                type="button"
                onClick={() => setCapturing(true)}
                className="m3-state mt-4 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
              >
                Add a photo of it
              </button>
            </div>
          ) : (
            <ul>
              {(posts.data ?? []).map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  notes={notes.data?.[post.id] ?? []}
                  mine={mine.has(post.id)}
                  onFlag={() =>
                    run(async () => {
                      const total = await flagPost(post.id, device ?? "");
                      toast.success(
                        total >= 4
                          ? "Flagged, and it is now hidden while it is looked at."
                          : "Flagged. Thanks — a few more and it comes down automatically.",
                      );
                    })
                  }
                  onDelete={() =>
                    run(async () => {
                      if (!device) throw new Error("This browser has no identity to delete with.");
                      const gone = await deleteOwnPost(post.id, device);
                      // The function reports whether a row actually matched. Ignoring
                      // that is how a delete which did nothing looked exactly like one
                      // that worked.
                      if (!gone) {
                        throw new Error("That post was not written on this device.");
                      }
                      rememberMine(post.id, false);
                      setJustMine((current) => {
                        const next = new Set(current);
                        next.delete(post.id);
                        return next;
                      });
                      toast.success("Deleted.");
                    })
                  }
                  onNote={(body) =>
                    run(async () => {
                      await addNote({ postId: post.id, device: device ?? "", body });
                      toast.success(
                        "Proposed. It shows publicly once enough readers agree it helps.",
                      );
                    })
                  }
                  onRateNote={(noteId, helpful) =>
                    run(() => rateNote(noteId, device ?? "", helpful))
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What do you actually see here?"
              className="max-h-28 min-h-11 flex-1 resize-none py-2.5 text-sm"
              maxLength={2000}
            />
            <button
              type="button"
              onClick={() => say.mutate(draft.trim())}
              disabled={draft.trim().length === 0 || say.isPending}
              aria-label="Post"
              className="m3-state grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-40"
            >
              {say.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {capturing ? <Capture open onOpenChange={setCapturing} projectId={projectId} /> : null}
    </>
  );
}

/** The thread as a sheet, for the feed. */
export function PostsSheet({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerTitle className="px-5 pb-1 pt-2 text-base font-semibold">
          <span className="line-clamp-1">{projectName}</span>
        </DrawerTitle>
        <p className="px-5 pb-3 text-xs leading-relaxed text-muted-foreground">
          Written by readers, not taken from any official record. Everything here goes up straight
          away and anyone can flag it or add a note.
        </p>
        <PostsThread projectId={projectId} enabled={open} />
      </DrawerContent>
    </Drawer>
  );
}
