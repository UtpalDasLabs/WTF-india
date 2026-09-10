import { useCallback, useSyncExternalStore } from "react";

/**
 * Which reactions this browser has already given, in one place.
 *
 * There are two ways to react to a card — the rail of faces, and a double tap
 * on the card itself — and with each reading storage on its own they disagreed:
 * a double tap counted on the server while the rail's face stayed dark, because
 * it had read localStorage once at mount and never heard about the tap.
 *
 * Same shape as the follow store, for the same reason: one module-level
 * snapshot, everyone subscribes, everyone sees the write.
 */
const STORAGE_KEY = "wtf.reacted";

const EMPTY: string[] = [];

let snapshot: string[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): string[] {
  try {
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

function load(): string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
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

function write(next: string[]) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the reaction still counted on the server.
  }
  emit();
}

/** Readable outside React, for the gesture handler. */
export function hasReacted(key: string): boolean {
  if (!loaded) {
    loaded = true;
    snapshot = load();
  }
  return snapshot.includes(key);
}

export function setReacted(key: string, on: boolean) {
  if (!loaded) {
    loaded = true;
    snapshot = load();
  }
  const has = snapshot.includes(key);
  if (has === on) return;
  write(on ? [...snapshot, key] : snapshot.filter((item) => item !== key));
}

export function useReacted() {
  const keys = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
  const has = useCallback((key: string) => keys.includes(key), [keys]);
  return { has, set: setReacted };
}
