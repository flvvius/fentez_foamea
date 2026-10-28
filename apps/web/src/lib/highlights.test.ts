import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/offers";
import { pickHighlights } from "./highlights";

const base: Offer = {
  id: "1",
  source: "bonapp",
  kind: "surplus",
  title: "Pachet",
  price: 20,
  originalPrice: 40,
  discountPct: 50,
  endsAt: null,
  pickupStart: "2026-10-21T15:00:00Z",
  pickupEnd: "2026-10-21T17:00:00Z",
  available: 2,
  checkedAt: null,
  firstSeenAt: null,
  url: "https://example.com",
  deliveryOnly: false,
  venueId: "v1",
  venueName: "Bistro",
  daysOfWeek: null,
  timeStart: null,
  timeEnd: null,
  conditions: null,
  chain: null,
  lat: 44.4355,
  lon: 26.1025,
};

const now = new Date("2026-10-21T12:00:00Z");

describe("pickHighlights", () => {
  it("leaves out delivery-only, sold-out, unpriced and finished offers", () => {
    const offers: Offer[] = [
      base,
      { ...base, id: "delivery", venueId: "v2", deliveryOnly: true, kind: "discount", pickupStart: null, pickupEnd: null },
      { ...base, id: "sold", venueId: "v3", available: 0 },
      { ...base, id: "unpriced", venueId: "v4", price: null },
      { ...base, id: "gone", venueId: "v5", pickupEnd: "2026-10-21T11:00:00Z" },
      { ...base, id: "tomorrow", venueId: "v6", pickupStart: "2026-10-22T15:00:00Z", pickupEnd: "2026-10-22T17:00:00Z" },
    ];
    expect(pickHighlights(offers, now).picks.map((pick) => pick.id)).toEqual(["1"]);
  });

  it("skips menus that are not cheaper than usual and deals that don't run today", () => {
    const menu = { ...base, id: "menu", kind: "daily_menu" as const, venueId: "v2", originalPrice: null, discountPct: null, pickupStart: null, pickupEnd: null };
    const notToday = { ...base, id: "monday", kind: "combo" as const, venueId: "v3", daysOfWeek: [1], pickupStart: null, pickupEnd: null };
    expect(pickHighlights([base, menu, notToday], now).picks.map((pick) => pick.id)).toEqual(["1"]);
  });

  it("shows one copy of a chain deal and counts today's offers per category", () => {
    const chain = { ...base, kind: "combo" as const, chain: "KFC", pickupStart: null, pickupEnd: null, title: "Meniu", discountPct: 30 };
    const offers = [base, { ...chain, id: "k1", venueId: "k1" }, { ...chain, id: "k2", venueId: "k2", lat: 44.45 }];
    const result = pickHighlights(offers, now);
    expect(result.picks.filter((pick) => pick.chain === "KFC")).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.kinds.map((entry) => [entry.slug, entry.count])).toEqual([
      ["pachete-anti-risipa", 1],
      ["oferte-1-plus-1", 2],
    ]);
  });

  it("caps the list", () => {
    const offers = Array.from({ length: 9 }, (_, index) => ({ ...base, id: `o${index}`, venueId: `v${index}`, lat: 44.43 + index / 100 }));
    expect(pickHighlights(offers, now, 3).picks).toHaveLength(3);
  });
});
