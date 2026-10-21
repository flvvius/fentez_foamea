import { describe, expect, it } from "vitest";
import { countOffers } from "./format";

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
