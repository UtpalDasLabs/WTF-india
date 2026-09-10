import { useCallback, useEffect, useSyncExternalStore } from "react";

import { deviceId } from "@/hooks/use-device-id";
import { myFollows, toggleFollow } from "@/lib/queries";

/**
 * Projects the reader is keeping an eye on.
 *
 * Deliberately not behind a login. Asking someone to create an account before
 * they have got any value is where civic apps lose people, so following costs
 * one tap and no identity — it is keyed to the same device id as reactions and
 * posts.
 *
 * Written in two places on purpose. localStorage answers instantly and works
 * offline, which is what the button needs; the database holds the same rows so
 * the button can say how many other people are watching, which localStorage can
 * never know. The local copy leads and the server catches up, so a failed
 * request costs a count rather than a tap.
 *
 * The list lives in one module-level store rather than in each component's own
 * state: the follow button sits inside a card while the "you are following"
 * section sits in the page around it, and with per-component state the section
 * never hears about the tap. Subscribers are notified on write, and on the
 * `storage` event so a second tab stays in step.
 */
const STORAGE_KEY = "wtf.following";

const EMPTY: string[] = [];

let snapshot: string[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): string[] {
  try {
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function load(): string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // A private window with storage blocked still gets a working session.
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  // First subscriber pulls storage in. Doing it here rather than at module load
  // keeps the server render and the first client render both seeing an empty
  // list, so hydration matches; the update lands immediately after.
  if (!loaded) {
    loaded = true;
    snapshot = load();
  }
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    snapshot = load();
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string[] {
  return snapshot;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function write(next: string[]) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the session still works, it just will not survive a reload.
  }
  emit();
}

/** Pulled once per session: a browser that lost its storage still knows. */
let reconciled = false;

export function useFollow() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The server is the fuller record — a cleared browser, or a second one on the
  // same device id, would otherwise start again from nothing. Merged rather
  // than replaced, so anything followed while offline is not thrown away.
  useEffect(() => {
    if (reconciled) return;
    reconciled = true;
    const device = deviceId();
    if (!device) return;
    void myFollows(device)
      .then((remote) => {
        const merged = [...new Set([...snapshot, ...remote])];
        if (merged.length !== snapshot.length) write(merged);
      })
      .catch(() => {
        // Offline, or the row is not there. The local list still works.
      });
  }, []);

  const toggle = useCallback((id: string) => {
    const current = snapshot;
    const following = current.includes(id);
    write(following ? current.filter((item) => item !== id) : [...current, id]);

    const device = deviceId();
    if (!device) return;
    void toggleFollow(id, device).catch(() => {
      // The tap stands locally. Only the public count misses it, and the next
      // reconcile puts it right.
    });
  }, []);

  const isFollowing = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, isFollowing, count: ids.length };
}
