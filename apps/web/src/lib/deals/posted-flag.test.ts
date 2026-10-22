import { describe, expect, it } from "vitest";
import { markPosted, takePosted } from "./posted-flag";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  } as Storage;
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("posted flag", () => {
  it("matches the id once, then is gone", () => {
    const storage = fakeStorage();
    markPosted("a", storage);
    expect(takePosted("a", storage)).toBe(true);
    expect(takePosted("a", storage)).toBe(false);
  });

  it("does not match another id, and still clears the marker", () => {
    const storage = fakeStorage();
    markPosted("a", storage);
    expect(takePosted("b", storage)).toBe(false);
    expect(takePosted("a", storage)).toBe(false);
  });

  it("is false when nothing was marked", () => {
    expect(takePosted("a", fakeStorage())).toBe(false);
  });

  it("survives blocked or missing storage", () => {
    expect(() => markPosted("a", throwing)).not.toThrow();
    expect(takePosted("a", throwing)).toBe(false);
    expect(() => markPosted("a", null)).not.toThrow();
    expect(takePosted("a", null)).toBe(false);
  });
});
