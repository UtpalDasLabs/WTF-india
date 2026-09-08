/**
 * Which build is actually running.
 *
 * Stamped in by vite at build time. This exists because "I still see the old
 * version" was impossible to answer: a stale browser cache, an old sideloaded
 * APK and a failed deploy are indistinguishable from the outside. Now the app
 * says so itself.
 */
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "dev";
export const BUILD_TIME: string = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "local";

export const REPO_COMMIT_URL = `https://github.com/UtpalDasLabs/WTF-india/commit/${BUILD_COMMIT}`;
