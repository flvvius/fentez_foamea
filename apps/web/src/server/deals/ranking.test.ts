import { describe, expect, it } from "vitest";
import { HOT_DECAY_SECONDS, hotRank, voteDelta, type VoteValue } from "./ranking";

describe("voteDelta", () => {
  const cases: [VoteValue, VoteValue, number][] = [
    [0, 0, 0],
    [0, 1, 1],
    [0, -1, -1],
    [1, 0, -1],
    [1, 1, 0],
    [1, -1, -2],
    [-1, 0, 1],
    [-1, 1, 2],
    [-1, -1, 0],
  ];
  it.each(cases)("%i -> %i is %i", (prev, next, delta) => {
    expect(voteDelta(prev, next)).toBe(delta);
  });
});

describe("hotRank", () => {
  const t = new Date("2026-10-20T12:00:00Z");

  it("puts a newer deal above an older one at equal score", () => {
    const newer = new Date(t.getTime() + 60_000);
    expect(hotRank(3, newer)).toBeGreaterThan(hotRank(3, t));
  });

  it("values a 10x score at 12.5 hours of recency", () => {
    expect(HOT_DECAY_SECONDS).toBe(45000);
    const older = new Date(t.getTime() - HOT_DECAY_SECONDS * 1000);
    expect(hotRank(10, older)).toBeCloseTo(hotRank(1, t), 10);
    expect(hotRank(100, older)).toBeCloseTo(hotRank(10, t), 10);
  });

  it("sorts a negative score below zero at equal time", () => {
    expect(hotRank(-1, t)).toBe(hotRank(0, t));
    expect(hotRank(-5, t)).toBeLessThan(hotRank(0, t));
    expect(hotRank(-100, t)).toBeLessThan(hotRank(-5, t));
  });
});
