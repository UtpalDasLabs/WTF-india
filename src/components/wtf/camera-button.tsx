import { Camera } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The camera, on its own, away from the sheet it opens.
 *
 * This button is in the chrome of every page, so whatever module it lives in is
 * downloaded before anything is drawn. The sheet it opens is not: it carries a
 * drawer, a form, and the EXIF reader and canvas resizer for the photograph,
 * none of which is any use until somebody actually taps this. Keeping them in
 * separate modules is what lets the sheet be fetched on the tap instead.
 */
export function CameraButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add a photo of a project near you"
      className={cn(
        "m3-state grid size-12 place-items-center rounded-full bg-foreground text-background shadow-lg transition-transform active:scale-95",
        className,
      )}
    >
      <Camera className="size-5" aria-hidden />
    </button>
  );
}
