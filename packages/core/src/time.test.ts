import { describe, expect, it } from "vitest";
import { bucharestLocalToIso, parseTimeRange } from "./time.ts";

describe("bucharestLocalToIso", () => {
  it("applies summer time", () => {
    expect(bucharestLocalToIso("2026-07-01", "17:00")).toBe("2026-07-01T14:00:00.000Z");
  });

  it("applies winter time", () => {
    expect(bucharestLocalToIso("2026-12-01", "17:00")).toBe("2026-12-01T15:00:00.000Z");
  });

  it("rejects junk", () => {
    expect(bucharestLocalToIso("Invalid date", "17:00")).toBeUndefined();
  });
});

describe("parseTimeRange", () => {
  it("splits a pickup window", () => {
    expect(parseTimeRange("17:00 - 19:30")).toEqual(["17:00", "19:30"]);
  });
});
