// A one-shot marker that says "this browser tab just published deal <id>". The feed pins the
// deal (and says "Oferta ta a fost publicată") only when the marker matches the id in the URL,
// so opening someone else's /?posted=<id> link shows nothing special.

const KEY = "fentez:just-posted";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function markPosted(id: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, id);
  } catch {
    // Storage can be blocked; the deal just isn't pinned.
  }
}

/** True once, when the marker equals `id`. The marker is cleared whenever it is read. */
export function takePosted(id: string, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    const stored = storage?.getItem(KEY) ?? null;
    if (stored !== null) storage?.removeItem(KEY);
    return stored === id;
  } catch {
    return false;
  }
}
