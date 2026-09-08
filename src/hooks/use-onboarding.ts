import { useCallback, useEffect, useState } from "react";

/**
 * Whether the reader has been through the current first run.
 *
 * Stored locally and checked after mount, so a returning visitor is not shown it
 * twice and a first-time visitor is not blocked by a network round trip.
 *
 * The stored value is the *version* of the first run they saw, not a boolean.
 * A plain "done" flag means anybody who has ever opened the app can never see a
 * new opening again — which is exactly what happened when the radar replaced the
 * city picker: everyone who had used the app once was silently kept on a screen
 * that no longer existed. Bumping this number replays the first run for people
 * who last saw an older one, and only for them.
 */
const STORAGE_KEY = "wtf.onboarded";

/** 1: pick-your-city welcome. 2: location request and radar scan. */
const VERSION = 2;

export function useOnboarding() {
  // Undefined until we have read storage, so nothing flashes on first paint.
  const [done, setDone] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    try {
      const seen = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
      setDone(seen >= VERSION);
    } catch {
      // Storage blocked: never trap somebody in a loop of first-run screens.
      setDone(true);
    }
  }, []);

  const finish = useCallback(() => {
    setDone(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(VERSION));
    } catch {
      // Nothing to do; the reader simply sees it again next time.
    }
  }, []);

  const reset = useCallback(() => {
    setDone(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignored.
    }
  }, []);

  return { done, finish, reset };
}
