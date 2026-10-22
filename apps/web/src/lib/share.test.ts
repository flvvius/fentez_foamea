import { describe, expect, it } from "vitest";
import { offerHeadline, offerLink } from "./share";

describe("share text", () => {
  it("leads with the price and discount", () => {
    expect(offerHeadline({ title: "Pachet surpriză", price: 15, discountPct: 67, venueName: "Brutăria", chain: null })).toBe(
      "15 lei −67% · Pachet surpriză la Brutăria",
    );
  });

  it("falls back to the chain and skips missing numbers", () => {
    expect(offerHeadline({ title: "Taco Tuesday", price: null, discountPct: null, venueName: null, chain: "Taco Bell" })).toBe(
      "Taco Tuesday la Taco Bell",
    );
  });

  it("builds a link to the offer", () => {
    expect(offerLink("https://x.ro", "a b")).toBe("https://x.ro/?oferta=a%20b");
  });
});
