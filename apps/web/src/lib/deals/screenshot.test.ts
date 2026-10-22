import { describe, expect, it } from "vitest";
import { fitWithin, MAX_UPLOAD_BYTES, QUALITY_STEPS } from "./screenshot";

describe("fitWithin", () => {
  it("leaves small images alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });
  it("scales the longest side to 1600 and keeps the ratio", () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1170, 2532)).toEqual({ width: 739, height: 1600 });
  });
  it("never produces a zero side", () => {
    expect(fitWithin(100_000, 1).height).toBe(1);
  });
});

describe("limits", () => {
  it("matches the server's 1.5 MB cap and starts at quality 0.85", () => {
    expect(MAX_UPLOAD_BYTES).toBe(1_572_864);
    expect(QUALITY_STEPS[0]).toBe(0.85);
    expect([...QUALITY_STEPS]).toEqual([...QUALITY_STEPS].sort((a, b) => b - a));
  });
});
