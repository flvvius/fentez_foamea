import { describe, expect, it } from "vitest";
import { discountPercent, isGenuineDiscount, parseRonPrice } from "./price.ts";

describe("parseRonPrice", () => {
  it.each([
    ["24,50 lei", 24.5],
    ["24.5 RON", 24.5],
    ["1.299,00 lei", 1299],
    ["35 lei", 35],
    ["de la 9,9 lei", 9.9],
  ])("parses %s", (input, expected) => {
    expect(parseRonPrice(input)).toBe(expected);
  });

  it("returns undefined without digits", () => {
    expect(parseRonPrice("gratuit")).toBeUndefined();
  });
});

describe("discountPercent", () => {
  it("rounds the saving", () => {
    expect(discountPercent(19.99, 30)).toBe(33);
  });

  it("ignores prices that are not lower", () => {
    expect(discountPercent(30, 30)).toBeUndefined();
    expect(isGenuineDiscount(28, 30)).toBe(false);
  });
});
