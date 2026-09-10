import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deviceId } from "@/hooks/use-device-id";
import { useReacted } from "@/hooks/use-reacted";
import { toggleReaction, type Reaction, type ReactionCounts } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * A way to say what you think about a project without writing anything.
 *
 * A comment box asks for a sentence and gets nothing from most people. A row of
 * four faces asks for one tap, and the tap is honest: these are all shades of
 * exasperation, because a project eleven years past its own deadline does not
 * need a "like" button. What it does not do is feed the ranking — Trending
 * stays anchored on the promised date and the money, so a brigade can move an
 * emoji count and nothing else.
 */
const FACES: Array<{ key: Reaction; glyph: string; label: string }> = [
  { key: "facepalm", glyph: "🤦", label: "I can't believe this" },
  { key: "doubt", glyph: "🤨", label: "I doubt it" },
  { key: "outrage", glyph: "🤬", label: "This is outrageous" },
  { key: "again", glyph: "🙄", label: "Here we go again" },
];

/** The one a double tap means. Instagram taught everybody this gesture. */
export const DOUBLE_TAP_REACTION: Reaction = "facepalm";

export function Reactions({
  projectId,
  counts,
  className,
  /**
   * `row` is the quiet version that sits in a list. `rail` is the one that runs
   * down the side of a full-bleed feed card, where the faces are the interface
   * rather than a footnote — bigger, stacked, and legible over a photograph.
   */
  variant = "row",
}: {
  projectId: string;
  counts: ReactionCounts | undefined;
  className?: string;
  variant?: "row" | "rail";
}) {
  const queryClient = useQueryClient();
  const mine = useReacted();
  // Held next to the server counts so a tap reads instantly and still settles
  // against the truth when the refetch lands.
  const [pending, setPending] = useState<Record<string, number>>({});

  const totals = useMemo(() => counts?.[projectId] ?? {}, [counts, projectId]);

  const react = useMutation({
    mutationFn: ({ reaction, voter }: { reaction: Reaction; voter: string }) =>
      toggleReaction(projectId, reaction, voter),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["reactions"] }),
  });

  const onTap = useCallback(
    (reaction: Reaction) => {
      const voter = deviceId();
      if (!voter) return;
      const key = `${projectId}:${reaction}`;
      const on = mine.has(key);

      mine.set(key, !on);
      setPending((current) => ({
        ...current,
        [reaction]: (current[reaction] ?? 0) + (on ? -1 : 1),
      }));

      react.mutate(
        { reaction, voter },
        {
          onError: () => {
            // Put it back rather than leave a count that never happened.
            mine.set(key, on);
            setPending((current) => ({
              ...current,
              [reaction]: (current[reaction] ?? 0) + (on ? 1 : -1),
            }));
          },
          onSuccess: () => setPending((current) => ({ ...current, [reaction]: 0 })),
        },
      );
    },
    [mine, projectId, react],
  );

  if (variant === "rail") {
    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        {FACES.map(({ key, glyph, label }) => {
          const on = mine.has(`${projectId}:${key}`);
          const total = Math.max((totals[key] ?? 0) + (pending[key] ?? 0), 0);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTap(key)}
              aria-pressed={on}
              aria-label={`${label}${total > 0 ? ` — ${total} so far` : ""}`}
              title={label}
              className="group flex flex-col items-center gap-0.5"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-11 place-items-center rounded-full text-2xl leading-none backdrop-blur-sm transition-all active:scale-90",
                  on ? "bg-white/85 scale-105" : "bg-black/35",
                )}
              >
                {glyph}
              </span>
              <span
                data-numeric
                className="text-[11px] font-semibold tabular-nums text-white drop-shadow"
              >
                {total > 0 ? total : ""}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {FACES.map(({ key, glyph, label }) => {
        const on = mine.has(`${projectId}:${key}`);
        const total = Math.max((totals[key] ?? 0) + (pending[key] ?? 0), 0);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTap(key)}
            aria-pressed={on}
            aria-label={`${label}${total > 0 ? ` — ${total} so far` : ""}`}
            title={label}
            className={cn(
              "m3-state inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm leading-none transition-colors",
              on
                ? "border-primary bg-primary/10 text-foreground"
                : "border-outline-variant text-muted-foreground hover:bg-surface-container-high",
            )}
          >
            <span aria-hidden className="text-base">
              {glyph}
            </span>
            {total > 0 ? (
              <span data-numeric className="text-xs font-semibold tabular-nums">
                {total}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
