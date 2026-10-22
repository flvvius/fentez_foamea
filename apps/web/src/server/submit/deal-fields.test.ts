import { describe, expect, it } from "vitest";
import { computePriceFields, defaultValidUntil, isPlausibleInstant, latestValidUntil } from "./deal-fields";

describe("defaultValidUntil", () => {
  it("is the end of the Bucharest day a week ahead (winter, UTC+2)", () => {
    // 2026-01-10 12:00 UTC is Saturday 14:00 in Bucharest; +7 days = 2026-01-17 23:59:59 EET.
    expect(defaultValidUntil(new Date("2026-01-10T12:00:00Z"))).toBe("2026-01-17T21:59:59.000Z");
  });

  it("is the end of the Bucharest day a week ahead (summer, UTC+3)", () => {
    expect(defaultValidUntil(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-17T20:59:59.000Z");
  });

  it("uses the Bucharest date, not the UTC one, just before midnight UTC", () => {
    // 22:30 UTC on 10 Jan is already 11 Jan 00:30 in Bucharest.
    expect(defaultValidUntil(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-18T21:59:59.000Z");
  });

  it("counts calendar days across the spring DST change", () => {
    // 2026-03-25 + 7 = 2026-04-01, after the change on 2026-03-29 (UTC+3 by then).
    expect(defaultValidUntil(new Date("2026-03-25T10:00:00Z"))).toBe("2026-04-01T20:59:59.000Z");
  });

  it("counts from validFrom when that is still ahead", () => {
    expect(defaultValidUntil(new Date("2026-01-10T12:00:00Z"), "2026-01-20T08:00:00Z")).toBe("2026-01-27T21:59:59.000Z");
  });

  it("ignores a validFrom in the past", () => {
    expect(defaultValidUntil(new Date("2026-01-10T12:00:00Z"), "2026-01-01T08:00:00Z")).toBe("2026-01-17T21:59:59.000Z");
  });
});

describe("computePriceFields", () => {
  it("derives the percentage from the two prices, whatever was sent", () => {
    expect(computePriceFields({ dealPrice: 15, regularPrice: 30, percentOff: 90 })).toEqual({
      notADiscount: false,
      percentOff: 50,
    });
  });

  it("flags a deal price equal to the regular price and drops the percentage", () => {
    expect(computePriceFields({ dealPrice: 30, regularPrice: 30, percentOff: 50 })).toEqual({
      notADiscount: true,
      percentOff: null,
    });
  });

  it("flags a deal price above the regular price", () => {
    expect(computePriceFields({ dealPrice: 35, regularPrice: 30, percentOff: null }).notADiscount).toBe(true);
  });

  it("drops a percentage that rounds to 0", () => {
    expect(computePriceFields({ dealPrice: 29.9, regularPrice: 30, percentOff: 40 })).toEqual({
      notADiscount: false,
      percentOff: null,
    });
  });

  it("keeps the stated percentage when there is not a pair of prices to check it against", () => {
    expect(computePriceFields({ dealPrice: null, regularPrice: null, percentOff: 30 })).toEqual({
      notADiscount: false,
      percentOff: 30,
    });
    expect(computePriceFields({ dealPrice: 20, regularPrice: null, percentOff: 30 })).toEqual({
      notADiscount: false,
      percentOff: 30,
    });
  });

  it("treats a free deal as 100% off", () => {
    expect(computePriceFields({ dealPrice: 0, regularPrice: 20, percentOff: null })).toEqual({
      notADiscount: false,
      percentOff: 100,
    });
  });
});

describe("latestValidUntil", () => {
  it("is the end of the Bucharest day 90 days after now", () => {
    expect(latestValidUntil(new Date("2026-10-22T12:00:00Z"), null)).toBe("2027-01-20T21:59:59.000Z");
  });

  it("counts from validFrom when that is ahead, and ignores one in the past", () => {
    expect(latestValidUntil(new Date("2026-10-22T12:00:00Z"), "2026-12-01T00:00:00Z")).toBe("2027-03-01T21:59:59.000Z");
    expect(latestValidUntil(new Date("2026-10-22T12:00:00Z"), "2026-10-01T00:00:00Z")).toBe("2027-01-20T21:59:59.000Z");
  });
});

describe("isPlausibleInstant", () => {
  it("accepts 1970 to 2099 and nothing else", () => {
    expect(isPlausibleInstant(Date.UTC(1970, 0, 1))).toBe(true);
    expect(isPlausibleInstant(Date.UTC(2099, 11, 31))).toBe(true);
    expect(isPlausibleInstant(Date.UTC(1969, 11, 31))).toBe(false);
    expect(isPlausibleInstant(Date.UTC(2100, 0, 1))).toBe(false);
    expect(isPlausibleInstant(Number.NaN)).toBe(false);
    expect(isPlausibleInstant(Infinity)).toBe(false);
  });
});
