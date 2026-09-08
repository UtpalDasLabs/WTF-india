import { useCallback, useEffect, useState } from "react";

/**
 * Whether the reader has been through the first-run questions.
 *
 * Stored locally and checked after mount, so a returning visitor never sees the
 * welcome again and a first-time visitor is not blocked by anything that needs
 * a network round trip.
 */
const STORAGE_KEY = "wtf.onboarded";

export function useOnboarding() {
  // Undefined until we have read storage, so nothing flashes on first paint.
  const [done, setDone] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    try {
      setDone(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDone(true);
    }
  }, []);

  const finish = useCallback(() => {
    setDone(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Nothing to do; the reader simply sees the welcome again next time.
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
