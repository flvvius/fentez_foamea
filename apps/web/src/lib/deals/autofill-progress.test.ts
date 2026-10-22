import { describe, expect, it } from "vitest";
import { AUTOFILL_STEPS, SLOW_AFTER_MS, isSlow, stepStates } from "./autofill-progress";

describe("stepStates", () => {
  it("starts with the first step active and the rest waiting", () => {
    expect(stepStates("link", 0)).toEqual(["active", "waiting", "waiting", "waiting"]);
  });

  it("marks earlier steps done as time passes", () => {
    expect(stepStates("link", 5000)).toEqual(["done", "done", "active", "waiting"]);
  });

  it("never marks the last step done, however long it takes", () => {
    const states = stepStates("image", 120_000);
    expect(states.at(-1)).toBe("active");
    expect(states.filter((s) => s === "active")).toHaveLength(1);
  });

  it("follows each source's own timeline", () => {
    for (const source of ["link", "image"] as const) {
      const steps = AUTOFILL_STEPS[source];
      steps.forEach((step, i) => expect(stepStates(source, step.startsAtMs).indexOf("active")).toBe(i));
    }
  });
});

describe("isSlow", () => {
  it("turns on at the threshold", () => {
    expect(isSlow(SLOW_AFTER_MS - 1)).toBe(false);
    expect(isSlow(SLOW_AFTER_MS)).toBe(true);
  });
});
