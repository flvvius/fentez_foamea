import { describe, expect, it } from "vitest";
import type { DealCard } from "@/server/deals/types";
import { formatDaysAway, formatOpening, formatWait, openingStatus } from "./opening";

type Schedule = Pick<DealCard, "validFrom" | "validUntil" | "daysOfWeek" | "timeStart" | "timeEnd">;

// Saturday 24 Oct 2026, 14:00 in Bucharest (UTC+3, summer time ends on 25 Oct).
const NOW = new Date("2026-10-24T11:00:00Z");
const base: Schedule = { validFrom: null, validUntil: "2026-12-31T21:59:59Z", daysOfWeek: null, timeStart: null, timeEnd: null };
const text = (deal: Partial<Schedule>, now = NOW) => formatOpening(openingStatus({ ...base, ...deal }, now), now);

describe("openingStatus", () => {
  it("is open with no end time when the deal has no days or hours", () => {
    expect(openingStatus(base, NOW)).toEqual({ kind: "open", closesAt: null });
    expect(text({})).toBe("Activă acum");
  });

  it("counts down to a later window today", () => {
    expect(text({ timeStart: "17:00", timeEnd: "19:00" })).toBe("Începe la 17:00 · peste 3 h");
  });

  it("is open inside today's window and says when it closes", () => {
    expect(text({ timeStart: "12:00", timeEnd: "15:00" })).toBe("Activă acum · până la 15:00");
  });

  it("moves to the next allowed weekday", () => {
    // Thursday only: the next one is 29 Oct, five days away.
    expect(text({ daysOfWeek: [4] })).toBe("Începe joi · peste 5 zile");
    expect(text({ daysOfWeek: [4], timeStart: "12:00", timeEnd: "15:00" })).toBe("Începe joi la 12:00 · peste 5 zile");
  });

  it("is open on an allowed weekday without hours", () => {
    expect(openingStatus({ ...base, daysOfWeek: [6] }, NOW).kind).toBe("open");
  });

  it("waits for a future start date", () => {
    expect(text({ validFrom: "2026-10-31T22:00:00Z" })).toBe("Începe pe 1 nov. · peste 8 zile");
  });

  it("treats a window past midnight as still open after midnight", () => {
    const night = new Date("2026-10-17T22:30:00Z"); // 01:30 on Sunday 18 Oct in Bucharest
    expect(text({ timeStart: "22:00", timeEnd: "02:00" }, night)).toBe("Activă acum · până la 02:00");
  });

  it("only runs an overnight window on the weekday it starts", () => {
    const night = new Date("2026-10-17T22:30:00Z"); // 01:30 on Sunday 18 Oct
    expect(openingStatus({ ...base, daysOfWeek: [6], timeStart: "22:00", timeEnd: "02:00" }, night).kind).toBe("open");
    expect(openingStatus({ ...base, daysOfWeek: [7], timeStart: "22:00", timeEnd: "02:00" }, night).kind).toBe("opens");
  });

  it("keeps local hours across the end of summer time", () => {
    // Sunday 25 Oct, after the switch to UTC+2: 12:00 local is 10:00 UTC.
    const status = openingStatus({ ...base, daysOfWeek: [7], timeStart: "12:00", timeEnd: "15:00" }, NOW);
    expect(status).toEqual({ kind: "opens", at: new Date("2026-10-25T10:00:00Z"), hasTime: true });
  });

  it("has nothing to say about an expired deal", () => {
    expect(text({ validUntil: "2026-10-24T10:00:00Z" })).toBeNull();
  });

  it("stops at the end date even inside a window", () => {
    expect(text({ timeStart: "12:00", timeEnd: "18:00", validUntil: "2026-10-24T12:30:00Z" })).toBe("Activă acum · până la 15:30");
  });
});

describe("formatWait", () => {
  it.each([
    [30_000, "peste 1 min"],
    [45 * 60_000, "peste 45 min"],
    [3 * 3_600_000, "peste 3 h"],
    [(3 * 60 + 20) * 60_000, "peste 3 h 20 min"],
  ])("writes %i ms as %s", (ms, expected) => {
    expect(formatWait(ms)).toBe(expected);
  });
});

describe("formatDaysAway", () => {
  it.each([
    [1, "mâine"],
    [5, "peste 5 zile"],
    [21, "peste 21 de zile"],
    [101, "peste 101 zile"],
  ])("writes %i days as %s", (days, expected) => {
    expect(formatDaysAway(days)).toBe(expected);
  });

  it("says tomorrow for a window starting tomorrow at noon", () => {
    expect(text({ daysOfWeek: [7], timeStart: "12:00", timeEnd: "15:00" })).toBe("Începe duminică la 12:00 · mâine");
  });

  it("gives hours, not days, for a window starting just after midnight", () => {
    const evening = new Date("2026-10-17T19:00:00Z"); // Saturday 22:00
    expect(text({ daysOfWeek: [7], timeStart: "01:00", timeEnd: "03:00" }, evening)).toBe("Începe duminică la 01:00 · peste 3 h");
  });
});
