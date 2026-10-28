import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/offers";
import { pickHighlights, pickSaved } from "./highlights";

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

  it("puts bargains before menus that are not cheaper than usual, and skips deals that don't run today", () => {
    const menu = { ...base, id: "menu", title: "Meniul zilei", kind: "daily_menu" as const, venueId: "v2", venueName: "Bistro Doi", originalPrice: null, discountPct: null, pickupStart: null, pickupEnd: null };
    const notToday = { ...base, id: "monday", kind: "combo" as const, venueId: "v3", venueName: "Trei", daysOfWeek: [1], pickupStart: null, pickupEnd: null };
    expect(pickHighlights([menu, base, notToday], now).picks.map((pick) => pick.id)).toEqual(["1", "menu"]);
  });

  it("shows one copy of a chain deal and counts today's offers per category", () => {
    const chain = { ...base, kind: "combo" as const, chain: "KFC", pickupStart: null, pickupEnd: null, title: "Meniu", discountPct: 30 };
    const offers = [base, { ...chain, id: "k1", venueId: "k1" }, { ...chain, id: "k2", venueId: "k2", lat: 44.45 }];
    const result = pickHighlights(offers, now);
    expect(result.picks.filter((pick) => pick.chain === "KFC")).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.kinds.map((entry) => [entry.slug, entry.count])).toEqual([
      ["pachete-anti-risipa", 1],
      ["oferte-1-plus-1", 1],
    ]);
  });

  it("shows one offer per brand", () => {
    const offers = [
      { ...base, id: "a", venueId: "va", venueName: "Ana Pan Coposu" },
      { ...base, id: "b", venueId: "vb", venueName: "Ana Pan Știrbei", lat: 44.44 },
      { ...base, id: "c", venueId: "vc", venueName: "La Mama", lat: 44.43 },
    ];
    expect(pickHighlights(offers, now).picks.map((pick) => pick.venueName)).toEqual(["Ana Pan Coposu", "La Mama"]);
  });

  it("leaves out offers too expensive to count as cheap food", () => {
    expect(pickHighlights([{ ...base, price: 105, originalPrice: 210 }], now).picks).toEqual([]);
  });

  it("fills the list with priced combos and menus when there are few bargains", () => {
    const combo = { ...base, id: "combo", title: "Pizza + suc", kind: "combo" as const, venueId: "v2", venueName: "Pizza Hut", originalPrice: null, discountPct: null, pickupStart: null, pickupEnd: null };
    expect(pickHighlights([base, combo], now).picks.map((pick) => pick.id)).toEqual(["1", "combo"]);
  });

  it("caps the list", () => {
    const offers = Array.from({ length: 9 }, (_, index) => ({ ...base, id: `o${index}`, venueId: `v${index}`, venueName: `Local ${index}`, lat: 44.43 + index / 100 }));
    expect(pickHighlights(offers, now, 3).picks).toHaveLength(3);
  });
});

describe("pickSaved", () => {
  it("lists today's offers at saved venues, including the same place under another source", () => {
    const offers: Offer[] = [
      { ...base, id: "bag", venueId: "v1", venueName: "Brutăria din Colț" },
      { ...base, id: "app", source: "glovo", kind: "discount", venueId: "v1-glovo", venueName: "Brutaria din Colt", pickupStart: null, pickupEnd: null },
      { ...base, id: "other", venueId: "v9", venueName: "Altundeva", lat: 44.45 },
      { ...base, id: "sold", venueId: "v1", available: 0 },
    ];
    const saved = pickSaved(offers, ["v1"], now);
    expect(saved.picks.map((pick) => pick.id).sort()).toEqual(["app", "bag"]);
    expect(saved.total).toBe(2);
  });
});
