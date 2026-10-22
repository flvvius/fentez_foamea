import { describe, expect, it } from "vitest";
import { formatSchedule, formatValidity, isNotADiscount, isOvernight, priceFigure, sourceHost } from "./deal-display";

const base = { dealType: "fixed_price", currency: "RON", dealPrice: 25, regularPrice: 40, percentOff: 38, notADiscount: false } as const;

describe("priceFigure", () => {
  it("shows the price, the struck regular price and the percentage for a real discount", () => {
    expect(priceFigure(base)).toMatchObject({ price: "25", unit: "lei", was: "40", off: "−38%", notADiscount: false });
  });

  it("never shows a percentage or a struck price when notADiscount is set", () => {
    const figure = priceFigure({ ...base, dealPrice: 40, regularPrice: 35, percentOff: 12, notADiscount: true });
    expect(figure.off).toBeNull();
    expect(figure.was).toBeNull();
    expect(figure.notADiscount).toBe(true);
  });

  it("omits the percentage when there is none, and the struck price when there is no regular price", () => {
    expect(priceFigure({ ...base, percentOff: null }).off).toBeNull();
    expect(priceFigure({ ...base, regularPrice: null }).was).toBeNull();
  });

  it("falls back to the deal type when there is no price", () => {
    expect(priceFigure({ ...base, dealPrice: null, dealType: "bogo" })).toMatchObject({ price: null, fallbackLabel: "1+1" });
  });

  it("formats decimals the Romanian way and names other currencies", () => {
    expect(priceFigure({ ...base, dealPrice: 12.5, currency: "EUR" })).toMatchObject({ price: "12,5", unit: "EUR" });
  });
});

describe("formatSchedule", () => {
  it("joins a weekday range and a time window", () => {
    expect(formatSchedule({ daysOfWeek: [1, 2, 3, 4, 5], timeStart: "12:00", timeEnd: "15:00" })).toBe("L–V, 12:00–15:00");
  });

  it("lists non-contiguous days", () => {
    expect(formatSchedule({ daysOfWeek: [6, 1, 3], timeStart: null, timeEnd: null })).toBe("L, Mi, S");
  });

  it("says nothing for every day without hours", () => {
    expect(formatSchedule({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeStart: null, timeEnd: null })).toBeNull();
    expect(formatSchedule({ daysOfWeek: null, timeStart: null, timeEnd: null })).toBeNull();
  });

  it("allows windows across midnight", () => {
    expect(isOvernight("22:00", "02:00")).toBe(true);
    expect(isOvernight("12:00", "15:00")).toBe(false);
    expect(formatSchedule({ daysOfWeek: null, timeStart: "22:00", timeEnd: "02:00" })).toBe("22:00–02:00 (peste noapte)");
  });
});

describe("formatValidity", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("writes the end date in Bucharest time", () => {
    expect(formatValidity({ validFrom: null, validUntil: "2026-10-29T20:59:59.000Z" }, now)).toBe("până pe 29 oct.");
  });
  it("mentions a start date that is still ahead", () => {
    expect(formatValidity({ validFrom: "2026-10-24T21:00:00.000Z", validUntil: "2026-10-29T20:59:59.000Z" }, now)).toBe(
      "din 25 oct. până pe 29 oct.",
    );
  });
  it("ignores a start date in the past", () => {
    expect(formatValidity({ validFrom: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-29T20:59:59.000Z" }, now)).toBe("până pe 29 oct.");
  });
});

describe("sourceHost", () => {
  it("returns the host without www", () => {
    expect(sourceHost("https://www.tiktok.com/@a/video/1")).toBe("tiktok.com");
    expect(sourceHost("http://example.ro:8080/x")).toBe("example.ro");
  });
  it("refuses anything that is not http(s)", () => {
    expect(sourceHost("javascript:alert(1)")).toBeNull();
    expect(sourceHost("nope")).toBeNull();
    expect(sourceHost(null)).toBeNull();
  });
});

describe("isNotADiscount", () => {
  it("is true at or above the regular price", () => {
    expect(isNotADiscount(40, 40)).toBe(true);
    expect(isNotADiscount(41, 40)).toBe(true);
    expect(isNotADiscount(30, 40)).toBe(false);
    expect(isNotADiscount(null, 40)).toBe(false);
  });
});
