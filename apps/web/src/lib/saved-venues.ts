import { useCallback, useSyncExternalStore } from "react";

const KEY = "fentezfoamea:saved-venues";
const MAX_SAVED = 200;
const NONE: readonly string[] = [];

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedIds: readonly string[] = NONE;

export function parseSaved(raw: string | null): readonly string[] {
  if (!raw) return NONE;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, MAX_SAVED) : NONE;
  } catch {
    return NONE;
  }
}

export function toggled(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((saved) => saved !== id) : [id, ...ids].slice(0, MAX_SAVED);
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function snapshot(): readonly string[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = parseSaved(raw);
  }
  return cachedIds;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => event.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSavedVenues() {
  const ids = useSyncExternalStore(subscribe, snapshot, () => NONE);
  const toggle = useCallback((id: string) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(toggled(snapshot(), id)));
    } catch {
      return;
    }
    for (const listener of listeners) listener();
  }, []);
  return { ids, toggle };
}
