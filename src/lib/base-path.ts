// The app is served from "/" by the server build and from "/<repo>/" on GitHub Pages.
// Vite replaces import.meta.env.BASE_URL at build time; it always ends with a slash.
export const BASE_PATH = import.meta.env.BASE_URL;

/** Resolve a file in public/ against the deployed base, e.g. "favicon.png". */
export function publicAsset(file: string): string {
  return `${BASE_PATH}${file}`;
}

/** Absolute URL of the deployed app root, for auth redirects back into the app. */
export function appOrigin(): string {
  return new URL(BASE_PATH, window.location.origin).href;
}

/**
 * Where the app lives on the public web.
 *
 * Not the same thing as `appOrigin()`. Inside the Android build the app is
 * served from a local origin, so a link built from the current location would
 * open nothing on the recipient's phone. Anything shared with somebody else has
 * to point here.
 */
export const PUBLIC_SITE = "https://utpaldaslabs.github.io/WTF-india/";

/** The public, forwardable address of one project's page. */
export function projectUrl(projectId: string): string {
  return new URL(`projects/${projectId}`, PUBLIC_SITE).href;
}

/**
 * True in the GitHub Pages build, which is static: there is no SSR server and no
 * server-function endpoint, so anything backed by createServerFn is unavailable.
 * Supabase is unaffected — the browser talks to it directly.
 */
export const IS_STATIC_DEPLOY = import.meta.env["VITE_STATIC_DEPLOY"] === "true";
