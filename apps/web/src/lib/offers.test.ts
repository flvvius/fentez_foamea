import { describe, expect, it } from "vitest";
import { decodeSnapshot, encodeSnapshot, type Offer } from "./offers";

const offer: Offer = {
  id: "o1",
  source: "glovo",
  kind: "discount",
  title: "Burger",
  price: 24,
  originalPrice: 40,
  discountPct: 40,
  endsAt: null,
  pickupStart: null,
  pickupEnd: null,
  daysOfWeek: [1, 2],
  timeStart: "12:00",
  timeEnd: "16:00",
  conditions: null,
  available: null,
  checkedAt: null,
  url: "https://glovoapp.com/store",
  deliveryOnly: true,
  venueId: "v1",
  venueName: "Burger Rapid",
  chain: null,
  lat: 44.4430001,
  lon: 26.0980001,
};

describe("snapshot wire format", () => {
  it("round-trips offers, sharing venue fields and venue links", () => {
    const sibling = { ...offer, id: "o2", url: "https://glovoapp.com/store/item" };
    const national = { ...offer, id: "o3", venueId: null, venueName: null, lat: null, lon: null, url: "https://kfc.ro" };
    const wire = encodeSnapshot({
      generatedAt: "2026-10-22T10:00:00.000Z",
      updatedAt: null,
      offers: [offer, sibling, national].map((o) => ({ ...o, venueUrl: o.venueId ? "https://glovoapp.com/store" : null })),
    });

    expect(wire.venues.id).toEqual(["v1"]);
    expect(wire.offers.url).toEqual([null, "https://glovoapp.com/store/item", "https://kfc.ro"]);
    expect(decodeSnapshot(wire).offers).toEqual([
      { ...offer, lat: 44.443, lon: 26.098 },
      { ...sibling, lat: 44.443, lon: 26.098 },
      national,
    ]);
  });
});
