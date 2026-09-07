import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

import type { Project, ProjectSource } from "@/lib/queries";
import { shareProjectCard } from "@/lib/share-card";
import { cn } from "@/lib/utils";

/**
 * Turns a project into a forwardable image. This is the distribution mechanism:
 * the card carries the official numbers and its own citation, so a WhatsApp
 * forward is evidence rather than a rumour.
 */
export function ShareButton({
  project,
  sources,
  className,
}: {
  project: Project;
  sources?: ProjectSource[] | undefined;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await shareProjectCard({
        project,
        sourcePublisher: sources?.[0]?.publisher ?? null,
      });
      if (result === "downloaded") toast.success("Card saved — share it from your gallery.");
    } catch (error) {
      // A user dismissing the OS share sheet is not a failure worth shouting about.
      if ((error as Error)?.name === "AbortError") return;
      toast.error("Could not make the card just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={cn(
        "m3-state inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60",
        className,
      )}
    >
      <Share2 className="size-4" aria-hidden />
      {busy ? "Making card…" : "Share this"}
    </button>
  );
}
