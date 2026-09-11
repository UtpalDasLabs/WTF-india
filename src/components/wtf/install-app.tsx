import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, Plus, Share, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Rolling release asset published by .github/workflows/build-apk.yml on every push
 * to main. The filename is deliberately stable so this URL never has to change.
 */
export const APK_URL =
  "https://github.com/UtpalDasLabs/WTF-india/releases/latest/download/we-the-future.apk";

/** Offering to install the app from inside the app would be absurd. */
const isNativeApp = () => Capacitor.isNativePlatform();

const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/**
 * iPhone or iPad.
 *
 * iPadOS 13 and later report themselves as a Mac, so the user agent alone reads
 * an iPad as a desktop. A Mac with a touch screen does not exist, so the touch
 * points settle it.
 */
const isIos = () => {
  if (typeof navigator === "undefined") return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
};

/**
 * Already installed to the home screen.
 *
 * `display-mode: standalone` is the standard, and `navigator.standalone` is
 * Safari's own flag — still the only one iOS sets reliably for a home-screen
 * app, so both are asked.
 */
const isInstalled = () => {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
};

/**
 * How this device can have the app, if it can.
 *
 * There is no iOS download to offer. Apple will not let an app be installed
 * from anywhere but the App Store without a paid developer account, so the
 * honest iOS answer is Safari's Add to Home Screen — which gives a real icon, a
 * full-screen app with no browser chrome, and the same camera and location the
 * native build has.
 */
type Install = "apk" | "home-screen" | null;

function installRoute(): Install {
  if (isNativeApp() || isInstalled()) return null;
  if (isAndroid()) return "apk";
  if (isIos()) return "home-screen";
  return null;
}

export function InstallLink({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "quiet";
}) {
  // Only the APK is a link. Add to Home Screen is a menu in Safari that no page
  // can open, so in the chrome there is nothing to link to; InstallCard and
  // InstallPrompt explain it where there is room to.
  if (installRoute() !== "apk") return null;

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
export function InstallCard({ className }: { className?: string }) {
  const route = installRoute();
  if (!route) return null;

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
        {route === "apk" ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            An Android build of this site, made fresh from the current source. It is a debug build,
            so Android will ask you to allow installation from unknown sources.
          </p>
        ) : (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            On an iPhone the app installs from Safari itself. Tap{" "}
            <Share className="inline size-3.5 -translate-y-px" aria-label="Share" /> Share, then{" "}
            <span className="text-foreground">Add to Home Screen</span>. You get the icon, the full
            screen with no browser bar, and the same camera and map.
          </p>
        )}
      </div>
      {route === "apk" ? (
        <a
          href={APK_URL}
          className="m3-state inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          <Download className="size-4" aria-hidden />
          Download the APK
        </a>
      ) : (
        <p className="inline-flex shrink-0 items-center gap-2 rounded-full border border-outline-variant px-5 py-2.5 text-sm font-semibold text-foreground">
          <Plus className="size-4" aria-hidden />
          Add to Home Screen
        </p>
      )}
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
 * answer permanently. It never appears inside the installed app, where it would
 * be offering to install itself.
 */
export function InstallPrompt({ afterSeconds = 45 }: { afterSeconds?: number }) {
  const [route, setRoute] = useState<Install>(null);

  useEffect(() => {
    const available = installRoute();
    if (!available) return;
    try {
      if (window.localStorage.getItem(ASKED_KEY)) return;
    } catch {
      // Storage blocked: ask this session and let it go at that.
    }
    const timer = window.setTimeout(() => setRoute(available), afterSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [afterSeconds]);

  const dismiss = () => {
    setRoute(null);
    try {
      window.localStorage.setItem(ASKED_KEY, "1");
    } catch {
      // It will ask again next visit. Not worth failing over.
    }
  };

  if (!route) return null;

  return (
    <div
      role="dialog"
      aria-label={route === "apk" ? "Install the Android app" : "Add the app to your home screen"}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] md:bottom-4 md:left-auto md:right-4 md:w-96 md:px-0 md:pb-0"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-high p-4 shadow-e3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background">
          {route === "apk" ? (
            <Download className="size-5" aria-hidden />
          ) : (
            <Plus className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Put this on your phone?</p>
          {route === "apk" ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The same app, installed — the camera opens faster and it remembers where you were. It
              is a debug build, so Android will ask you to allow unknown sources.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Tap <Share className="inline size-3 -translate-y-px" aria-label="Share" /> Share
              below, then <span className="text-foreground">Add to Home Screen</span>. It opens full
              screen with no browser bar, and remembers where you were.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {route === "apk" ? (
              <a
                href={APK_URL}
                onClick={dismiss}
                className="m3-state inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background hover:opacity-90"
              >
                <Download className="size-3.5" aria-hidden />
                Install
              </a>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="m3-state inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background hover:opacity-90"
              >
                Got it
              </button>
            )}
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
