import { useCallback, useRef, useState } from "react";

import { deviceId } from "@/hooks/use-device-id";
import { hasReacted, setReacted } from "@/hooks/use-reacted";
import { toggleReaction, type Reaction } from "@/lib/queries";

/**
 * Double tap a card to react, the way everybody already expects.
 *
 * The gesture is worth having because the rail asks for a small, deliberate aim
 * and the card is the whole screen. What it costs is precision, so two rules
 * keep it from firing by accident:
 *
 *   - it only ever turns a reaction *on*. A stray double tap on something you
 *     already reacted to must not silently take it back.
 *   - anything you can actually press — a button, a link — is left alone, so
 *     double-tapping "Follow" does not also react.
 *
 * `dblclick` is not used: on a phone it arrives late, after the browser has
 * spent 300ms deciding whether you meant to zoom, and it does not fire at all
 * on some Android WebViews.
 *
 * The card this is attached to needs `touch-manipulation`, or iOS zooms on the
 * second tap while this fires — see the feed card in feed.tsx.
 */

const WINDOW_MS = 320;
/** Two taps far apart are two taps, not a double. */
const SLOP_PX = 36;

export function useDoubleTapReaction(
  projectId: string,
  reaction: Reaction,
  onReacted?: () => void,
) {
  const last = useRef<{ at: number; x: number; y: number } | null>(null);
  // Where the burst is drawn, so it lands under the thumb rather than in the
  // middle of a card the thumb is nowhere near.
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Leave the real controls alone.
      if ((event.target as HTMLElement).closest("button,a,input,textarea,select")) {
        last.current = null;
        return;
      }

      const now = Date.now();
      const previous = last.current;
      const near =
        previous != null &&
        now - previous.at < WINDOW_MS &&
        Math.abs(event.clientX - previous.x) < SLOP_PX &&
        Math.abs(event.clientY - previous.y) < SLOP_PX;

      if (!near) {
        last.current = { at: now, x: event.clientX, y: event.clientY };
        return;
      }
      last.current = null;

      const rect = event.currentTarget.getBoundingClientRect();
      setBurst({ x: event.clientX - rect.left, y: event.clientY - rect.top, id: now });

      const key = `${projectId}:${reaction}`;
      // On only. A double tap must never take back a reaction you meant.
      if (hasReacted(key)) return;

      const device = deviceId();
      if (!device) return;
      // Shared with the rail of faces, so the one you just gave lights up there
      // too rather than staying dark until the next mount.
      setReacted(key, true);
      void toggleReaction(projectId, reaction, device)
        .then(() => onReacted?.())
        .catch(() => {
          // The burst already played. A lost count is not worth an error toast
          // over a gesture somebody may not have known they made.
        });
    },
    [projectId, reaction, onReacted],
  );

  const clearBurst = useCallback(() => setBurst(null), []);

  return { onPointerUp, burst, clearBurst };
}
