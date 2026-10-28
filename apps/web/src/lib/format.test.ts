import { describe, expect, it } from "vitest";
import { countOffers, formatPrice, formatRelative, formatWalk } from "./format";

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
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it.each([
    [0, "chiar acum"],
    [5, "acum 5 min"],
    [59, "acum 59 min"],
    [120, "acum 2 h"],
    [23 * 60, "acum 23 h"],
    [24 * 60, "ieri"],
    [47 * 60, "acum 2 zile"],
    [2 * 24 * 60, "acum 2 zile"],
    [19 * 24 * 60, "acum 19 zile"],
    [20 * 24 * 60, "acum 20 de zile"],
    [21 * 24 * 60, "acum 21 de zile"],
    [101 * 24 * 60, "acum 101 zile"],
    [120 * 24 * 60, "acum 120 de zile"],
  ])("writes %i minutes ago as %s", (minutes, text) => {
    expect(formatRelative(ago(minutes), now)).toBe(text);
  });
});

describe("formatWalk", () => {
  it("allows for streets not running straight and leaves out walks over half an hour", () => {
    expect(formatWalk(20)).toBe("1 min pe jos");
    expect(formatWalk(660)).toBe("11 min pe jos");
    expect(formatWalk(2500)).toBeNull();
  });
});
