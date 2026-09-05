import { Capacitor } from "@capacitor/core";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Rolling release asset published by .github/workflows/build-apk.yml on every push
 * to main. The filename is deliberately stable so this URL never has to change.
 */
export const APK_URL =
  "https://github.com/UtpalDasLabs/WTF-india/releases/latest/download/we-the-future.apk";

/** Offering an APK download inside the APK would be absurd. */
const isAndroidApp = () => Capacitor.isNativePlatform();

export function ApkDownloadLink({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "quiet";
}) {
  if (isAndroidApp()) return null;

  return (
    <a
      href={APK_URL}
      className={cn(
        "m3-state inline-flex items-center gap-1.5 rounded-full text-sm font-medium",
        variant === "quiet"
          ? "text-muted-foreground hover:text-foreground"
          : "border border-outline-variant px-3.5 py-2 hover:bg-surface-container-high",
        className,
      )}
    >
      <Download className="size-4" aria-hidden />
      Android app
    </a>
  );
}

/** The fuller pitch, for the discovery page rather than the chrome. */
export function ApkDownloadCard({ className }: { className?: string }) {
  if (isAndroidApp()) return null;

  return (
    <section
      className={cn(
        "flex flex-wrap items-center justify-between gap-5 rounded-xl border border-border bg-surface p-5",
        className,
      )}
    >
      <div className="max-w-md">
        <p className="eyebrow text-muted-foreground">Take it with you</p>
        <h2 className="display-sm mt-2 text-foreground">The same projects, on your phone</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          An Android build of this site, made fresh from the current source. It is a debug build, so
          Android will ask you to allow installation from unknown sources.
        </p>
      </div>
      <a
        href={APK_URL}
        className="m3-state inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
      >
        <Download className="size-4" aria-hidden />
        Download the APK
      </a>
    </section>
  );
}
