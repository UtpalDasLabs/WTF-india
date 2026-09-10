import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ChevronUp, Flame, MessageCircle, Share2, Users } from "lucide-react";

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
  if (length <= 6) return "clamp(3.5rem, 20vw, 7rem)";
  if (length <= 10) return "clamp(2.75rem, 14vw, 5rem)";
  if (length <= 16) return "clamp(2rem, 10vw, 3.5rem)";
  return "clamp(1.75rem, 7.5vw, 2.75rem)";
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
  onComment,
  onCamera,
}: {
  card: Card;
  rank: number;
  photo: Post | undefined;
  talk: number;
  reactions: ReactionCounts | undefined;
  onComment: () => void;
  onCamera: () => void;
}) {
  const { project } = card;
  const follow = useFollow();
  const following = follow.isFollowing(project.id);
  const figure = heroFigure(project);
  const place = [project.district, project.state].filter(Boolean).join(", ") || "India";

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
        // Flat black under a wall of text reads as a page that failed to load.
        // A single wash of the status colour, low enough not to shout, gives the
        // card a temperature before a word of it is read.
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(125% 75% at 50% 0%, ${
              figure.alarming ? "var(--status-delayed)" : "var(--status-ongoing)"
            } 0%, transparent 68%)`,
            opacity: 0.5,
          }}
        />
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

      <div className="relative flex h-full items-end gap-4 px-5 pb-36 pt-[max(3.5rem,env(safe-area-inset-top))] md:px-8 md:pb-20">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* The community line, not a second copy of the figure below it: which
              place this is, where it sits today, and whether anybody has been. */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/75 sm:text-xs">
            <span className="font-semibold text-white">w/{place}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 font-medium">
              <Flame className="size-3.5" aria-hidden />#{rank}
            </span>
            <span aria-hidden>·</span>
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
          <div className="flex flex-1 flex-col justify-end pb-5">
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

          <p className="mt-2 line-clamp-2 max-w-lg text-sm leading-relaxed text-white/70">
            {project.plain_summary}
          </p>

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

export function Feed({
  cards,
  photos,
  counts,
  reactions,
}: {
  cards: Card[];
  /** The newest photograph for each project, if a reader has taken one. */
  photos: Record<string, Post>;
  counts: PostCounts;
  reactions: ReactionCounts | undefined;
}) {
  const [loaded, setLoaded] = useState(PAGE);
  const [active, setActive] = useState(0);
  const [commenting, setCommenting] = useState<Project | null>(null);
  const [capturing, setCapturing] = useState<Project | null>(null);

  const shown = useMemo(() => cards.slice(0, loaded), [cards, loaded]);

  useEffect(() => {
    if (active >= loaded - 3 && loaded < cards.length) {
      setLoaded((current) => Math.min(current + PAGE, cards.length));
    }
  }, [active, loaded, cards.length]);

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
        aria-label="Projects, most talked about first"
      >
        {shown.map((card, index) => (
          <FeedCard
            key={card.project.id}
            card={card}
            rank={index + 1}
            photo={photos[card.project.id]}
            talk={counts[card.project.id]?.total ?? 0}
            reactions={reactions}
            onComment={() => setCommenting(card.project)}
            onCamera={() => setCapturing(card.project)}
          />
        ))}
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
