import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/offers";
import { applyFilters, placeOffers, sortOffers, venuePins } from "./explore";

const base: Offer = {
  id: "1",
  source: "bonapp",
  kind: "surplus",
  title: "Pachet",
  description: null,
  price: 20,
  originalPrice: 40,
  discountPct: 50,
  endsAt: null,
  pickupStart: null,
  pickupEnd: null,
  available: 2,
  imageUrl: null,
  url: "https://example.com",
  deliveryOnly: false,
  venueId: "v1",
  venueName: "Bistro",
  venueAddress: null,
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

  it("keeps offers without a location regardless of radius", () => {
    const far = { ...base, id: "far", lat: 44.5, lon: 26.2 };
    const national = { ...base, id: "nat", venueId: null, lat: null, lon: null };
    const placed = placeOffers([base, far, national], origin, now);
    const kept = applyFilters(placed, { kinds: [], radiusKm: 2, includeDelivery: true });
    expect(kept.map((o) => o.id)).toEqual(["1", "nat"]);
  });

  it("sorts by price and groups pins by venue", () => {
    const cheap = { ...base, id: "cheap", price: 9, discountPct: 70 };
    const placed = placeOffers([base, cheap], origin, now);
    expect(sortOffers(placed, "price")[0]?.id).toBe("cheap");
    expect(venuePins(placed)).toEqual([
      expect.objectContaining({ venueId: "v1", count: 2, minPrice: 9, bestDiscount: 70 }),
    ]);
  });
});
