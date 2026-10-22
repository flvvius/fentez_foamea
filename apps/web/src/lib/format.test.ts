import { describe, expect, it } from "vitest";
import { countOffers, formatPrice, formatRelative } from "./format";

describe("formatPrice", () => {
  it.each([
    [15, "15"],
    [9.9, "9,90"],
    [40.9, "40,90"],
    [2.99, "2,99"],
    [1250, "1.250"],
  ])("writes %s lei as %s", (value, text) => {
    expect(formatPrice(value)).toBe(text);
  });
});

describe("countOffers", () => {
  it.each([
    [1, "1 ofertă"],
    [2, "2 oferte"],
    [19, "19 oferte"],
    [20, "20 de oferte"],
    [101, "101 oferte"],
    [100, "100 de oferte"],
    [1365, "1365 de oferte"],
  ])("writes %i as %s", (count, text) => {
    expect(countOffers(count)).toBe(text);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

  it.each([
    [0.25, "acum 15 min"],
    [3, "acum 3 h"],
    [26, "ieri"],
    [72, "acum 3 zile"],
    [24 * 21, "acum 21 de zile"],
  ])("writes %f hours ago as %s", (hours, text) => {
    expect(formatRelative(ago(hours), now)).toBe(text);
  });
});
