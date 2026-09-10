import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Camera, Loader2, MapPin, MessageSquare, Smile, StickyNote } from "lucide-react";

import { useDeviceId } from "@/hooks/use-device-id";
import { useFollow } from "@/hooks/use-follow";
import { activityQuery, type Activity, type ActivityKind } from "@/lib/queries";
import { formatDate } from "@/lib/wtf";

/**
 * Everything you have done here, in order.
 *
 * Shown whether or not you are signed in, because almost none of it needs an
 * account — the reactions, posts, photographs and notes are all keyed to this
 * browser. That is worth stating on the page rather than leaving somebody to
 * work out why their history followed them without a login, and worth warning
 * about too: clear the browser and it is gone, because there is nothing else
 * holding it.
 */

const FACE: Record<string, string> = {
  facepalm: "🤦",
  doubt: "🤨",
  outrage: "🤬",
  again: "🙄",
};

const ICON: Record<ActivityKind, typeof Camera> = {
  photo: Camera,
  comment: MessageSquare,
  note: StickyNote,
  reaction: Smile,
  spot: MapPin,
};

function line(item: Activity): string {
  switch (item.kind) {
    case "photo":
      return "You photographed this";
    case "comment":
      return "You wrote about this";
    case "note":
      return "You added a note";
    case "reaction":
      return `You reacted ${FACE[item.detail] ?? ""}`.trim();
    case "spot":
      return "You put this on the map";
    default:
      return "You did something here";
  }
}

export function ActivityTimeline() {
  const device = useDeviceId();
  const activity = useQuery(activityQuery(device));
  const follow = useFollow();

  const items = activity.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border p-5 pb-4">
        <h2 className="display-md">What you have done</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Kept against this browser rather than against an account, which is why none of it needed a
          sign-in. Clearing your browser data clears this with it.
        </p>
        {follow.count > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You are following{" "}
            <strong className="font-semibold text-foreground">{follow.count}</strong>{" "}
            {follow.count === 1 ? "project" : "projects"}.
          </p>
        ) : null}
      </div>

      {activity.isLoading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm font-semibold">Nothing yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            React to something, say what you have seen, or photograph a project you walk past. It
            will all show up here.
          </p>
          <Link
            to="/"
            className="m3-state mt-4 inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Go to the feed
          </Link>
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {items.map((item, index) => {
            const Icon = ICON[item.kind] ?? MessageSquare;
            return (
              <li key={`${item.kind}-${item.happened_at}-${index}`} className="flex gap-3 p-4">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-container-high text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {line(item)} · {formatDate(item.happened_at)}
                  </p>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: item.project_id }}
                    className="mt-0.5 block text-sm font-semibold leading-snug hover:underline"
                  >
                    {item.project_name}
                  </Link>
                  {item.detail && item.kind !== "reaction" ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
