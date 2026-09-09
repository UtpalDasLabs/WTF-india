import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

const STORAGE_KEY = "wtf.reacted";
const VOTER_KEY = "wtf.voter";

/**
 * A random id this browser keeps, so a reaction can be taken back and counted
 * once without anybody having to make an account. It identifies a browser, not
 * a person, and the server never hands it back out.
 */
function voterId(): string {
  try {
    const existing = window.localStorage.getItem(VOTER_KEY);
    if (existing && existing.length >= 16) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(VOTER_KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked: still reactable, just not remembered between visits.
    return crypto.randomUUID();
  }
}

function readMine(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function writeMine(mine: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...mine]));
  } catch {
    // Ignored; the reaction still counted on the server.
  }
}

export function Reactions({
  projectId,
  counts,
  className,
}: {
  projectId: string;
  counts: ReactionCounts | undefined;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [mine, setMine] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readMine(),
  );
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
      const key = `${projectId}:${reaction}`;
      const on = mine.has(key);

      const next = new Set(mine);
      if (on) next.delete(key);
      else next.add(key);
      setMine(next);
      writeMine(next);
      setPending((current) => ({
        ...current,
        [reaction]: (current[reaction] ?? 0) + (on ? -1 : 1),
      }));

      react.mutate(
        { reaction, voter: voterId() },
        {
          onError: () => {
            // Put it back rather than leave a count that never happened.
            setMine(new Set(mine));
            writeMine(mine);
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
