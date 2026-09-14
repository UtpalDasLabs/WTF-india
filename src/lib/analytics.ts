import { Capacitor } from "@capacitor/core";

import { BASE_PATH, PUBLIC_SITE } from "@/lib/base-path";

/**
 * Google Analytics 4, for a single-page app that also ships as a phone app.
 *
 * Three things make this more than pasting Google's snippet.
 *
 * The app never reloads. GA's own page_view fires once, on the document load,
 * so every route after the first would be invisible. `send_page_view` is off
 * and every view — including the first — is sent from the router instead.
 *
 * The same code runs at three different addresses: the Pages site under
 * /WTF-india/, a dev server at /, and a WebView where the origin is
 * capacitor://localhost. Left alone that is three sets of paths for one set of
 * screens. The base is stripped and the path reported against the public site,
 * so /news is /news wherever it was read, and a `platform` user property says
 * which of the three it came from.
 *
 * And it costs nothing at startup. The dataLayer shim is a few lines with no
 * network; the tag itself is fetched when the app goes idle, and any view sent
 * before it arrives waits in the queue Google's own snippet uses.
 *
 * No measurement ID, no analytics: everything below turns into a no-op rather
 * than an error, so the app runs unchanged until one is set.
 */

const MEASUREMENT_ID = import.meta.env["VITE_GA_MEASUREMENT_ID"] ?? "";

/** How long to wait for an idle moment before loading the tag anyway. */
const IDLE_TIMEOUT_MS = 3000;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    // Internet Explorer put its opt-out here rather than on navigator, and
    // enough browsers copied it that it is still worth asking.
    doNotTrack?: string | null;
    wtfAnalytics?: () => Record<string, unknown>;
  }
}

/** Why nothing is being reported, or null when it is. */
type Silent = "no-measurement-id" | "development" | "do-not-track" | "no-window" | null;

function silentBecause(): Silent {
  if (typeof window === "undefined") return "no-window";
  if (!MEASUREMENT_ID) return "no-measurement-id";
  // A dev server's traffic is not traffic.
  if (import.meta.env.DEV) return "development";
  // Somebody who has asked not to be counted is not counted. It costs three
  // lines and this app is about what institutions do to people, not the
  // reverse.
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return "do-not-track";
  return null;
}

function tracks(): boolean {
  return silentBecause() === null;
}

let installed = false;

function install() {
  if (installed) return;
  installed = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // Google's tag reads the arguments object itself; pushing a plain array is
    // not the same thing to it.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    // The router sends these, so that route changes are counted too.
    send_page_view: false,
    // Analytics, not advertising. Google Signals turns a visit into a profile
    // tied to a Google account and brings the whole consent apparatus with it,
    // for numbers this project has no use for.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  window.gtag("set", "user_properties", { platform: Capacitor.getPlatform() });

  const load = () => {
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(tag);
  };

  // Deliberately not part of the first paint. Anything sent before the tag
  // arrives sits in dataLayer and goes out when it does.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(load, IDLE_TIMEOUT_MS);
  }
}

/** The path as the app knows it, with whatever the deploy is mounted under removed. */
export function screenPath(pathname: string): string {
  const base = BASE_PATH.endsWith("/") ? BASE_PATH.slice(0, -1) : BASE_PATH;
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname || "/";
}

let lastPath: string | null = null;

/**
 * One screen, seen once.
 *
 * The router can resolve the same location more than once — a search parameter
 * settling, a redirect landing where it started — and each of those would
 * otherwise be counted as another view.
 */
export function pageView(pathname: string, title?: string) {
  if (!tracks()) return;
  const path = screenPath(pathname);
  if (path === lastPath) return;
  lastPath = path;

  install();
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: new URL(path.replace(/^\//, ""), PUBLIC_SITE).href,
    page_title: title ?? document.title,
  });
}

/**
 * Something somebody did, as opposed to somewhere they went.
 *
 * Never pass anything that identifies a person: no device id, no account id, no
 * coordinates, no note text. What is worth knowing here is how many people do a
 * thing, not which ones.
 */
export function track(event: string, params?: Record<string, string | number | boolean>) {
  if (!tracks()) return;
  install();
  window.gtag?.("event", event, params);
}

/**
 * Why the dashboard is empty, answerable from the browser it is empty in.
 *
 * Analytics fails silently by design: the app works perfectly and the reports
 * are simply blank, and every likely cause — a blocked tag, Do Not Track, a
 * build with no id in it — looks identical from the outside. So the app says
 * which one it is. In the console of the running app:
 *
 *   wtfAnalytics()
 *
 * `silent` is the reason nothing is sent, `queued` counts what has been handed
 * to the tag, and `tagRequested` says whether the script was asked for at all —
 * if that is true and the reports are still empty, something between the
 * browser and Google is dropping it, which is usually an extension.
 */
if (typeof window !== "undefined") {
  window.wtfAnalytics = () => ({
    measurementId: MEASUREMENT_ID || null,
    reporting: tracks(),
    silent: silentBecause(),
    doNotTrack: navigator.doNotTrack ?? window.doNotTrack ?? null,
    tagRequested: installed,
    queued: window.dataLayer?.length ?? 0,
  });
}
