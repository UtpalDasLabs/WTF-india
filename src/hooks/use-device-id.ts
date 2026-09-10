import { useSyncExternalStore } from "react";

/**
 * Who you are here, without an account.
 *
 * The whole community layer — reactions, comments, photographs, notes — is keyed
 * to a random id this browser generates once and keeps. It identifies a browser,
 * not a person: it cannot be verified, and it is never handed back out by the
 * server, which returns a derived handle instead.
 *
 * The key is the one reactions have always used, so anybody who has already
 * tapped a face keeps the same identity rather than starting again as a stranger.
 */
const KEY = "wtf.voter";

/** Long enough to be unguessable, and inside the 16–64 the database enforces. */
function mint(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Very old browsers, and any context without a secure origin.
    return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
  }
}

let cached: string | null = null;

/**
 * Read the id, minting one on first use. Safe to call from an event handler; on
 * the server it returns null rather than inventing an id that would immediately
 * disagree with the browser's.
 */
export function deviceId(): string | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.length >= 16 && existing.length <= 64) {
      cached = existing;
      return cached;
    }
    const fresh = mint();
    window.localStorage.setItem(KEY, fresh);
    cached = fresh;
    return cached;
  } catch {
    // Storage blocked. Still usable for this tab; simply not remembered.
    cached ??= mint();
    return cached;
  }
}

/**
 * The same id as a hook, for anything that needs to render differently once it
 * knows who you are. It never changes after the first read, so the subscribe
 * half is a no-op — it exists to keep the server render and the first client
 * render agreeing on `null`.
 */
const noop = () => () => {};

export function useDeviceId(): string | null {
  return useSyncExternalStore(
    noop,
    () => deviceId(),
    () => null,
  );
}
