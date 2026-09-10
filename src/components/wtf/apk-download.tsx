import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";

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

/** Remembers that somebody said no, so the app only asks once. */
const ASKED_KEY = "wtf.apkprompt";

/**
 * The offer to install, made after the reader is actually interested.
 *
 * On arrival this is an interruption: nobody installs an app they have not used
 * yet, and asking then is how a banner gets learned as noise. So it waits until
 * somebody has been reading for a while, appears once, and takes no for an
 * answer permanently. It never appears inside the Android app, where it would
 * be offering to install itself.
 */
export function ApkInstallPrompt({ afterSeconds = 45 }: { afterSeconds?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isAndroidApp()) return;
    // Offering an Android build to an iPhone is a dead end.
    const android = /android/i.test(navigator.userAgent);
    if (!android) return;
    try {
      if (window.localStorage.getItem(ASKED_KEY)) return;
    } catch {
      // Storage blocked: ask this session and let it go at that.
    }
    const timer = window.setTimeout(() => setShow(true), afterSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [afterSeconds]);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(ASKED_KEY, "1");
    } catch {
      // It will ask again next visit. Not worth failing over.
    }
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Install the Android app"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] md:bottom-4 md:left-auto md:right-4 md:w-96 md:px-0 md:pb-0"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-high p-4 shadow-e3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background">
          <Download className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Put this on your phone?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The same app, installed — the camera opens faster and it remembers where you were. It is
            a debug build, so Android will ask you to allow unknown sources.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={APK_URL}
              onClick={dismiss}
              className="m3-state inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background hover:opacity-90"
            >
              <Download className="size-3.5" aria-hidden />
              Install
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="m3-state rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground hover:bg-surface-container-highest"
            >
              No thanks
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="m3-state -mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-container-highest"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
