import { describe, expect, it } from "vitest";
import { checkHealth } from "../src/health.ts";

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("checkHealth", () => {
  const noon = new Date("2026-10-22T12:00:00Z");

  it("flags sources whose last good run is older than their schedule allows", () => {
    const runs = [
      { source: "bonapp", lastOk: hoursAgo(noon, 3), lastStatus: "ok", lastError: null },
      { source: "kfc", lastOk: hoursAgo(noon, 20), lastStatus: "failed", lastError: "HTTP 403" },
    ];
    const health = checkHealth(runs, ["bonapp", "kfc", "wolt"], noon);
    expect(health.map((row) => [row.source, row.stale])).toEqual([
      ["bonapp", true],
      ["kfc", false],
      ["wolt", true],
    ]);
  });

  it("allows Bonapp a night without runs", () => {
    const night = new Date("2026-10-22T02:00:00Z");
    const runs = [{ source: "bonapp", lastOk: hoursAgo(night, 6), lastStatus: "ok", lastError: null }];
    expect(checkHealth(runs, ["bonapp"], night)[0]?.stale).toBe(false);
  });
});
