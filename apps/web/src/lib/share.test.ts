import { describe, expect, it } from "vitest";
import { offerHeadline, offerLink, offerShareText } from "./share";

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

  it("adds the pickup window so a shared bag says when to go", () => {
    const bag = { title: "Pachet", price: 15, discountPct: null, venueName: "Brutăria", chain: null };
    const now = new Date("2026-10-22T14:00:00Z");
    expect(offerShareText({ ...bag, pickupStart: "2026-10-22T16:00:00Z", pickupEnd: "2026-10-22T18:30:00Z" }, now)).toBe(
      "15 lei · Pachet la Brutăria, ridici azi 19:00–21:30",
    );
    expect(offerShareText({ ...bag, pickupStart: null, pickupEnd: null }, now)).toBe("15 lei · Pachet la Brutăria");
  });

  it("builds a link to the offer", () => {
    expect(offerLink("https://x.ro", "a b")).toBe("https://x.ro/?oferta=a%20b");
  });
});
