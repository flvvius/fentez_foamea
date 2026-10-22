import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/offers";
import { applyFilters, collapseChainCopies, placeOffers, sortOffers, validTodayFirst, venuePins } from "./explore";

const base: Offer = {
  id: "1",
  source: "bonapp",
  kind: "surplus",
  title: "Pachet",
  price: 20,
  originalPrice: 40,
  discountPct: 50,
  endsAt: null,
  pickupStart: null,
  pickupEnd: null,
  available: 2,
  checkedAt: null,
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
const origin = { lat: 44.4355, lon: 26.1025 };

describe("explore", () => {
  it("drops offers whose pickup window has passed", () => {
    const placed = placeOffers([base, { ...base, id: "2", pickupEnd: "2026-10-21T11:00:00Z" }], origin, now);
    expect(placed.map((o) => o.id)).toEqual(["1"]);
  });

  it("keeps national offers regardless of radius but drops venues it cannot place", () => {
    const far = { ...base, id: "far", lat: 44.5, lon: 26.2 };
    const national = { ...base, id: "nat", venueId: null, lat: null, lon: null };
    const unplaced = { ...base, id: "unplaced", venueId: "v2", lat: null, lon: null };
    const placed = placeOffers([base, far, national, unplaced], origin, now);
    const kept = applyFilters(placed, { kinds: [], radiusKm: 2, maxPrice: null, includeDelivery: true });
    expect(kept.map((o) => o.id)).toEqual(["1", "nat"]);
  });

  it("keeps offers within budget and drops ones without a price", () => {
    const placed = placeOffers([base, { ...base, id: "pricey", price: 30 }, { ...base, id: "unknown", price: null }], origin, now);
    const kept = applyFilters(placed, { kinds: [], radiusKm: null, maxPrice: 25, includeDelivery: true });
    expect(kept.map((o) => o.id)).toEqual(["1"]);
  });

  it("recommends concrete, nearby, deep deals over vague or far ones", () => {
    const vague = { ...base, id: "vague", kind: "discount" as const, price: null, discountPct: null, deliveryOnly: true };
    const far = { ...base, id: "far", lat: 44.5, lon: 26.2 };
    const delivery = { ...base, id: "delivery", kind: "discount" as const, deliveryOnly: true };
    const placed = placeOffers([vague, far, delivery, base], origin, now);
    expect(sortOffers(placed, "best").map((o) => o.id)).toEqual(["1", "delivery", "far", "vague"]);
  });

  it("sorts by price and groups pins by venue", () => {
    const cheap = { ...base, id: "cheap", price: 9, discountPct: 70 };
    const placed = placeOffers([base, cheap], origin, now);
    expect(sortOffers(placed, "price")[0]?.id).toBe("cheap");
    expect(venuePins(placed)).toEqual([
      expect.objectContaining({ venueId: "v1", count: 2, minPrice: 9, bestDiscount: 70 }),
    ]);
  });

  it("keeps only the nearest copy of a chain deal", () => {
    const deal = { ...base, source: "kfc" as const, kind: "combo" as const, chain: "KFC", title: "Bucket" };
    const placed = placeOffers(
      [
        { ...deal, id: "far", venueId: "a", lat: 44.47, lon: 26.1 },
        { ...deal, id: "near", venueId: "b" },
      ],
      origin,
      now,
    );
    const collapsed = collapseChainCopies(sortOffers(placed, "distance"));
    expect(collapsed.map((o) => [o.id, o.otherLocations])).toEqual([["near", 1]]);
  });

  it("moves offers that do not apply today below the rest", () => {
    const placed = placeOffers(
      [
        { ...base, id: "monday", daysOfWeek: [1] },
        { ...base, id: "always" },
        { ...base, id: "wednesday", daysOfWeek: [3] },
        { ...base, id: "tomorrow-bag", pickupStart: "2026-10-22T09:00:00Z", pickupEnd: "2026-10-22T11:00:00Z" },
        { ...base, id: "today-bag", pickupStart: "2026-10-21T15:00:00Z", pickupEnd: "2026-10-21T17:00:00Z" },
      ],
      origin,
      now,
    );
    expect(validTodayFirst(placed, now).map((o) => o.id)).toEqual(["always", "wednesday", "today-bag", "monday", "tomorrow-bag"]);
  });
});
