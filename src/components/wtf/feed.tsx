import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ChevronUp, Flame, MapPin, MessageCircle, Share2, Users } from "lucide-react";

import { Capture } from "@/components/wtf/capture";
import { PostsSheet } from "@/components/wtf/posts-sheet";
import { Reactions } from "@/components/wtf/reactions";
import { useFollow } from "@/hooks/use-follow";
import { computeDelay } from "@/lib/delay";
import { shareProjectCard } from "@/lib/share-card";
import {
  photoUrl,
  type Post,
  type PostCounts,
  type Project,
  type ReactionCounts,
} from "@/lib/queries";
import type { Heat } from "@/lib/hot";
import { formatDistance } from "@/lib/nearby";
import { SATELLITE_CREDIT, satelliteTileUrl } from "@/lib/satellite";
import { STATUS_LABEL, formatBudget } from "@/lib/wtf";
import { cn } from "@/lib/utils";

/**
 * The feed.
 *
 * A ranked list is something you read; a stack of full-screen cards is something
 * you fall into. That is the whole reason for this shape — every card is one
 * project, one number, and four things you can do about it without leaving the
 * screen or making an account. The gesture is the one every phone owner already
 * has in their thumb.
 *
 * The snapping is CSS, not JavaScript. `scroll-snap` gives real momentum, real
 * keyboard support and real accessibility for free, where a hand-rolled gesture
 * handler gives an approximation of all three.
 */

/** How many cards exist at once. Grows as you get near the end. */
const PAGE = 10;

type Card = { project: Project; heat: Heat };

/**
 * A card is either a project or something a reader posted about one.
 *
 * The second kind is not decoration. A photograph taken down the road this
 * morning is the most current thing the app knows about that road, and burying
 * it as a number on somebody else's card is how a community feature turns back
 * into a database.
 */
export type FeedItem =
  | { kind: "project"; key: string; card: Card; distanceKm: number | null }
  | {
      kind: "post";
      key: string;
      post: Post;
      project: Project | undefined;
      distanceKm: number | null;
    };

/**
 * The one figure the card is about.
 *
 * Only ever taken from the project's own record, in the order that a reader
 * would find most damning: money it has already overrun, then time, then the
 * sheer size of the cheque. A project with none of the three says so.
 */
function heroFigure(project: Project): { value: string; caption: string; alarming: boolean } {
  const original = project.original_cost_inr ?? null;
  const revised = project.revised_cost_inr ?? null;
  if (original && revised && revised > original) {
    const percent = Math.round(((revised - original) / original) * 100);
    return {
      value: `+${percent.toLocaleString("en-IN")}%`,
      caption: `over the ${formatBudget(original)} first sanctioned`,
      alarming: true,
    };
  }

  const delay = computeDelay(project);
  if (delay && delay.days > 0) {
    return {
      value: delay.label.replace(" late", ""),
      caption: "past the date it promised",
      alarming: true,
    };
  }

  if (project.budget_inr != null) {
    return { value: formatBudget(project.budget_inr), caption: "of public money", alarming: false };
  }

  return {
    value: STATUS_LABEL[project.status],
    caption:
      project.source_origin === "community"
        ? "added by a reader, not yet checked"
        : "no figures published for this one",
    alarming: false,
  };
}

/**
 * How big the hero figure can be set before it runs off the card.
 *
 * "+1,540%" and "10 years 5 months" are the same fact at very different widths,
 * and a single clamp sized for one clips the other. So the size is derived from
 * how much there is to say.
 */
function figureSize(value: string): string {
  const length = value.length;
  // 7rem is the page gutters plus the action rail and its gap. That width is
  // spoken for, so the figure may not use it — on a 412px phone "+103%" set to
  // 20vw ran clean under the outrage emoji.
  const fit = (perChar: number) => `calc((100vw - 7rem) / ${length} * ${perChar})`;
  if (length <= 6) return `min(6rem, ${fit(1.55)})`;
  if (length <= 10) return `min(4.5rem, ${fit(1.7)})`;
  if (length <= 16) return `min(3.25rem, ${fit(1.9)})`;
  return `min(2.5rem, ${fit(2)})`;
}

function RailButton({
  label,
  count,
  onClick,
  children,
  active,
}: {
  label: string;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-0.5"
    >
      <span
        className={cn(
          "grid size-11 place-items-center rounded-full backdrop-blur-sm transition-all active:scale-90",
          active ? "bg-white/85 text-black" : "bg-black/35 text-white",
        )}
      >
        {children}
      </span>
      <span data-numeric className="text-[11px] font-semibold tabular-nums text-white drop-shadow">
        {count && count > 0 ? count : ""}
      </span>
    </button>
  );
}

function FeedCard({
  card,
  rank,
  photo,
  talk,
  reactions,
  distanceKm,
  onComment,
  onCamera,
}: {
  card: Card;
  rank: number;
  photo: Post | undefined;
  talk: number;
  reactions: ReactionCounts | undefined;
  distanceKm: number | null;
  onComment: () => void;
  onCamera: () => void;
}) {
  const { project } = card;
  const follow = useFollow();
  const following = follow.isFollowing(project.id);
  const figure = heroFigure(project);
  const place = [project.district, project.state].filter(Boolean).join(", ") || "India";
  const satellite =
    project.latitude != null && project.longitude != null
      ? satelliteTileUrl(project.latitude, project.longitude)
      : null;

  return (
    <li className="relative h-[100dvh] w-full shrink-0 snap-start snap-always overflow-hidden bg-ink text-ink-foreground">
      {photo?.photo_path ? (
        <img
          src={photoUrl(photo.photo_path)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          {/* Nobody has stood in front of this one yet, so the card shows the
              place from orbit. It is the real patch of ground at the project's
              own coordinates — never a stock photograph of "a road" — and it is
              labelled, because it says where a thing is and nothing whatever
              about whether it was built. The first reader photograph replaces
              it. */}
          {satellite ? (
            <img
              src={satellite}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full scale-110 object-cover opacity-45 saturate-50"
            />
          ) : null}
          {/* Flat black under a wall of text reads as a page that failed to
              load. A wash of the status colour gives the card a temperature
              before a word of it is read, and holds the imagery down. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(125% 75% at 50% 0%, ${
                figure.alarming ? "var(--status-delayed)" : "var(--status-ongoing)"
              } 0%, transparent 68%)`,
              opacity: satellite ? 0.42 : 0.5,
            }}
          />
        </>
      )}

      {/* Enough scrim to keep white text legible over any photograph. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          photo?.photo_path
            ? "bg-gradient-to-t from-black/85 via-black/35 to-black/45"
            : "bg-gradient-to-t from-ink via-ink/40 to-transparent",
        )}
      />

      <div className="relative flex h-full items-end gap-5 px-5 pb-36 pt-[max(3.5rem,env(safe-area-inset-top))] md:px-8 md:pb-20">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* The community line, not a second copy of the figure below it: which
              place this is, where it sits today, and whether anybody has been.
              Separators are spacing, not characters — as glyphs they stranded a
              dot at the end of every line that wrapped. */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/75 sm:text-xs">
            <span className="font-semibold text-white">w/{place}</span>
            <span className="inline-flex items-center gap-1 font-medium">
              <Flame className="size-3.5" aria-hidden />#{rank}
            </span>
            {distanceKm != null ? (
              <span className="inline-flex items-center gap-1 font-medium">
                <MapPin className="size-3.5" aria-hidden />
                {formatDistance(distanceKm)} away
              </span>
            ) : null}
            <span>
              {talk === 0 ? "nobody has been yet" : `${talk} ${talk === 1 ? "post" : "posts"}`}
            </span>
            {project.source_origin === "community" ? (
              <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold">
                Added by a reader
              </span>
            ) : null}
          </p>

          {/* The figure carries the card. Given the whole upper half when there
              is no photograph, it is the first thing read from across a room —
              and it is always the project's own number, never an estimate. */}
          {/* Bottom-anchored, like a poster: the empty space above is the point,
              and the figure sits directly on top of the name it belongs to
              rather than floating apart from it. */}
          <div className="flex flex-1 flex-col justify-end overflow-hidden pb-5">
            <p
              data-numeric
              className={cn(
                "font-display font-medium leading-[0.95] tracking-tight",
                figure.alarming ? "text-status-delayed" : "text-white",
              )}
              style={{ fontSize: photo?.photo_path ? undefined : figureSize(figure.value) }}
            >
              {figure.value}
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70">{figure.caption}</p>
          </div>

          <h2 className="text-balance font-display text-2xl font-medium leading-tight text-white sm:text-3xl">
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              {project.name}
            </Link>
          </h2>

          <p className="mt-2 line-clamp-2 max-w-lg text-sm leading-relaxed text-white/70 max-[380px]:hidden">
            {project.plain_summary}
          </p>

          {satellite && !photo?.photo_path ? (
            <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/45">
              Satellite view of the site, not a photo of the work · {SATELLITE_CREDIT}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => follow.toggle(project.id)}
              aria-pressed={following}
              className={cn(
                "m3-state inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold backdrop-blur-sm",
                following ? "bg-white/20 text-white" : "bg-white text-black",
              )}
            >
              <Users className="size-3.5" aria-hidden />
              {following ? "Following" : "Follow this"}
            </button>
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="m3-state inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-sm"
            >
              See the paper trail
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3 pb-1">
          <Reactions projectId={project.id} counts={reactions} variant="rail" />
          <RailButton label="Read and add posts" count={talk} onClick={onComment}>
            <MessageCircle className="size-5" aria-hidden />
          </RailButton>
          <RailButton label="Add a photo of this" onClick={onCamera}>
            <Camera className="size-5" aria-hidden />
          </RailButton>
          <RailButton
            label="Share this"
            onClick={() => {
              // A dismissed OS share sheet is not a failure worth shouting about.
              void shareProjectCard({ project, sourcePublisher: null }).catch(() => {});
            }}
          >
            <Share2 className="size-5" aria-hidden />
          </RailButton>
        </div>
      </div>
    </li>
  );
}

/** How long ago, in as few characters as a card has room for. */
function shortAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d ago`;
  const months = days / 30.44;
  if (months < 12) return `${Math.round(months)}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Somebody stood there and sent this.
 *
 * Held to a visibly different register from a project card: no rank, no flame,
 * no figure. The photograph and the handle carry it, and the project it belongs
 * to is a line underneath rather than the headline — because the claim being
 * made here is "this is what it looks like", not "this is what the record says".
 */
function PostCard({
  post,
  project,
  distanceKm,
  onComment,
  onCamera,
}: {
  post: Post;
  project: Project | undefined;
  distanceKm: number | null;
  onComment: () => void;
  onCamera: () => void;
}) {
  const follow = useFollow();
  const following = project ? follow.isFollowing(project.id) : false;
  const place = project
    ? [project.district, project.state].filter(Boolean).join(", ") || "India"
    : "India";

  return (
    <li className="relative h-[100dvh] w-full shrink-0 snap-start snap-always overflow-hidden bg-ink text-ink-foreground">
      {post.photo_path ? (
        <img
          src={photoUrl(post.photo_path)}
          alt={post.body ?? "Photo posted by a reader"}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(125% 75% at 50% 0%, var(--status-ongoing) 0%, transparent 68%)",
            opacity: 0.45,
          }}
        />
      )}

      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          post.photo_path
            ? "bg-gradient-to-t from-black/85 via-black/30 to-black/45"
            : "bg-gradient-to-t from-ink via-ink/40 to-transparent",
        )}
      />

      <div className="relative flex h-full items-end gap-5 px-5 pb-36 pt-[max(3.5rem,env(safe-area-inset-top))] md:px-8 md:pb-20">
        <div className="flex h-full min-w-0 flex-1 flex-col justify-end">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/75 sm:text-xs">
            <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold text-white">
              Posted by a reader
            </span>
            <span className="font-semibold text-white">{post.handle}</span>
            <span>{shortAgo(post.created_at)}</span>
            {distanceKm != null ? (
              <span className="inline-flex items-center gap-1 font-medium">
                <MapPin className="size-3.5" aria-hidden />
                {formatDistance(distanceKm)} away
              </span>
            ) : null}
          </p>

          {post.body ? (
            <p
              className={cn(
                "mt-3 text-balance font-display font-medium leading-tight text-white",
                post.photo_path ? "line-clamp-4 text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
              )}
            >
              {post.body}
            </p>
          ) : (
            <p className="mt-3 font-display text-xl font-medium leading-tight text-white">
              A photo from {place}
            </p>
          )}

          {project ? (
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="mt-3 block max-w-lg text-sm leading-relaxed text-white/70 hover:text-white"
            >
              <span className="font-semibold text-white/90">w/{place}</span> · on{" "}
              <span className="underline underline-offset-2">{project.name}</span>
            </Link>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onComment}
              className="m3-state inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-black"
            >
              <MessageCircle className="size-3.5" aria-hidden />
              Reply or add a note
            </button>
            {project ? (
              <button
                type="button"
                onClick={() => follow.toggle(project.id)}
                aria-pressed={following}
                className={cn(
                  "m3-state inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold backdrop-blur-sm",
                  following ? "bg-white/20 text-white" : "bg-black/35 text-white",
                )}
              >
                <Users className="size-3.5" aria-hidden />
                {following ? "Following" : "Follow this"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3 pb-1">
          <RailButton label="Read and add posts" onClick={onComment}>
            <MessageCircle className="size-5" aria-hidden />
          </RailButton>
          <RailButton label="Add your own photo of this" onClick={onCamera}>
            <Camera className="size-5" aria-hidden />
          </RailButton>
          {project ? (
            <RailButton
              label="Share the project this is about"
              onClick={() => {
                void shareProjectCard({ project, sourcePublisher: null }).catch(() => {});
              }}
            >
              <Share2 className="size-5" aria-hidden />
            </RailButton>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function Feed({
  items,
  photos,
  counts,
  reactions,
}: {
  items: FeedItem[];
  /** The newest photograph for each project, if a reader has taken one. */
  photos: Record<string, Post>;
  counts: PostCounts;
  reactions: ReactionCounts | undefined;
}) {
  const [loaded, setLoaded] = useState(PAGE);
  const [active, setActive] = useState(0);
  const [commenting, setCommenting] = useState<Project | null>(null);
  const [capturing, setCapturing] = useState<Project | null>(null);

  const shown = useMemo(() => items.slice(0, loaded), [items, loaded]);

  useEffect(() => {
    if (active >= loaded - 3 && loaded < items.length) {
      setLoaded((current) => Math.min(current + PAGE, items.length));
    }
  }, [active, loaded, items.length]);

  // Rank is about projects, so a post card does not consume a number.
  let rank = 0;

  return (
    <>
      <ul
        // Every card is exactly one viewport tall, so which one is on screen is
        // arithmetic rather than a set of observers. `overscroll-contain` stops a
        // swipe past the last card from dragging the page behind it, which on a
        // phone reads as the app coming apart.
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.clientHeight > 0) setActive(Math.round(el.scrollTop / el.clientHeight));
        }}
        className="h-[100dvh] snap-y snap-mandatory overflow-y-auto overscroll-contain"
        aria-label="Projects and posts, most talked about first"
      >
        {shown.map((item) => {
          if (item.kind === "post") {
            return (
              <PostCard
                key={item.key}
                post={item.post}
                project={item.project}
                distanceKm={item.distanceKm}
                onComment={() => {
                  if (item.project) setCommenting(item.project);
                }}
                onCamera={() => {
                  if (item.project) setCapturing(item.project);
                }}
              />
            );
          }
          rank += 1;
          return (
            <FeedCard
              key={item.key}
              card={item.card}
              rank={rank}
              photo={photos[item.card.project.id]}
              talk={counts[item.card.project.id]?.total ?? 0}
              reactions={reactions}
              distanceKm={item.distanceKm}
              onComment={() => setCommenting(item.card.project)}
              onCamera={() => setCapturing(item.card.project)}
            />
          );
        })}
      </ul>

      {/* One hint, on the first card only, and gone the moment it is obeyed. */}
      {active === 0 ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-24 z-20 flex flex-col items-center gap-1 text-white/70 md:bottom-10"
        >
          <ChevronUp className="size-5 animate-bounce" />
          <span className="text-[11px] font-medium uppercase tracking-widest">Swipe up</span>
        </div>
      ) : null}

      {commenting ? (
        <PostsSheet
          projectId={commenting.id}
          projectName={commenting.name}
          open
          onOpenChange={(next) => {
            if (!next) setCommenting(null);
          }}
        />
      ) : null}

      {capturing ? (
        <Capture
          open
          projectId={capturing.id}
          onOpenChange={(next) => {
            if (!next) setCapturing(null);
          }}
        />
      ) : null}
    </>
  );
}
