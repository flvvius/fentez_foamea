import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/offers";
import { applyFilters, availableWithinHour, collapseChainCopies, featuredPinIds, percentInTitle, placeOffers, priceCapInTitle, samePlaceIds, sortOffers, validTodayFirst, venuePins } from "./explore";

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

  it("matches every searched word in the title, venue or chain, ignoring diacritics", () => {
    const placed = placeOffers(
      [
        { ...base, id: "ciorba", title: "Ciorbă de burtă", venueName: "La Mama Universitate" },
        { ...base, id: "pizza", title: "Pizza", venueName: "Zest" },
      ],
      origin,
      now,
    );
    const search = (query: string) => applyFilters(placed, { kinds: [], radiusKm: null, maxPrice: null, includeDelivery: true, query }).map((o) => o.id);
    expect(search("ciorba mama")).toEqual(["ciorba"]);
    expect(search("  ")).toEqual(["ciorba", "pizza"]);
    expect(search("burger")).toEqual([]);
  });

  it("finds other spellings of a dish and offers by their category", () => {
    const placed = placeOffers(
      [
        { ...base, id: "shawarma", title: "Shawarma de pui", venueName: "Dahab" },
        { ...base, id: "saorma", title: "Șaorma mare", venueName: "Calif" },
        { ...base, id: "menu", kind: "daily_menu", title: "Ciorbă + fel principal", venueName: "Bistro" },
      ],
      origin,
      now,
    );
    const search = (query: string) => applyFilters(placed, { kinds: [], radiusKm: null, maxPrice: null, includeDelivery: true, query }).map((o) => o.id);
    expect(search("shaorma")).toEqual(["shawarma", "saorma"]);
    expect(search("meniul zilei")).toEqual(["menu"]);
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

  it.each([
    ["-30% la tot meniul", 30],
    ["20% reducere pentru articolele selectate", 20],
    ["15% reducere (până la 30 RON)", 15],
    ["Prânzul sub 40 lei", null],
    ["1+1 la unele produse", null],
  ])("reads the headline percent from %s", (title, pct) => {
    expect(percentInTitle(title)).toBe(pct);
  });

  it("spreads recommendations across venues", () => {
    const bags = [70, 65, 60].map((discountPct, i) => ({ ...base, id: `same-${i}`, discountPct }));
    const elsewhere = { ...base, id: "elsewhere", venueId: "v2", venueName: "Altundeva", discountPct: 55 };
    const placed = placeOffers([...bags, elsewhere], origin, now);
    expect(sortOffers(placed, "best").map((o) => o.id)).toEqual(["same-0", "elsewhere", "same-1", "same-2"]);
  });

  it("treats a price ceiling in the title as the price for budget and sorting", () => {
    expect(priceCapInTitle("Prânzul sub 40 lei")).toBe(40);
    expect(priceCapInTitle("20% reducere")).toBeNull();
    const lunch = { ...base, id: "lunch", price: null, originalPrice: null, discountPct: null, title: "Prânzul sub 40 lei" };
    const placed = placeOffers([{ ...base, price: 45 }, lunch], origin, now);
    expect(applyFilters(placed, { kinds: [], radiusKm: null, maxPrice: 40, includeDelivery: true }).map((o) => o.id)).toEqual(["lunch"]);
    expect(sortOffers(placed, "price").map((o) => o.id)).toEqual(["lunch", "1"]);
  });

  it("gives a price-less pin the best percent from its titles", () => {
    const placed = placeOffers([{ ...base, price: null, discountPct: null, title: "-30% la shaorma" }], origin, now);
    expect(venuePins(placed)[0]).toMatchObject({ minPrice: null, bestDiscount: 30 });
  });

  it("sorts by price and groups pins by venue", () => {
    const cheap = { ...base, id: "cheap", price: 9, discountPct: 70 };
    const placed = placeOffers([base, cheap], origin, now);
    expect(sortOffers(placed, "price")[0]?.id).toBe("cheap");
    expect(venuePins(placed)).toEqual([
      expect.objectContaining({ venueId: "v1", count: 2, minPrice: 9, bestDiscount: 70 }),
    ]);
  });

  it("treats venues with the same name within 150 m as one place", () => {
    const bonapp = { ...base, id: "a", venueId: "v-bonapp", venueName: "Brutăria din Colț" };
    const glovo = { ...base, id: "b", source: "glovo" as const, venueId: "v-glovo", venueName: "BRUTARIA DIN COLT", lat: 44.4362, lon: 26.1027 };
    const otherBranch = { ...base, id: "c", venueId: "v-far", venueName: "Brutăria din Colț", lat: 44.45, lon: 26.1 };
    const places = samePlaceIds([glovo, bonapp, otherBranch]);
    expect(places.get("v-glovo")).toBe("v-bonapp");
    expect(places.has("v-far")).toBe(false);
    const placed = placeOffers([glovo, bonapp, otherBranch], origin, now);
    expect(venuePins(placed).map((pin) => [pin.venueId, pin.count])).toEqual([
      ["v-bonapp", 2],
      ["v-far", 1],
    ]);
  });

  it("shows one copy of a bag sold under two brand names from the same kitchen", () => {
    const bag = { ...base, title: "Cartofe Sambosa", price: 3.78 };
    const placed = placeOffers(
      [
        { ...bag, id: "holy", venueId: "a", venueName: "Holy Indian Curries" },
        { ...bag, id: "sana", venueId: "b", venueName: "Sana's Kitchen Hut" },
        { ...bag, id: "elsewhere", venueId: "c", venueName: "Sana's Kitchen Hut Pipera", lat: 44.5 },
      ],
      origin,
      now,
    );
    expect(collapseChainCopies(sortOffers(placed, "distance")).map((o) => [o.id, o.alsoSoldAs])).toEqual([
      ["holy", ["Sana's Kitchen Hut"]],
      ["elsewhere", []],
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
        { ...base, id: "lunch-over", timeStart: "10:00", timeEnd: "14:00" },
        { ...base, id: "lunch-on", timeStart: "10:00", timeEnd: "16:00" },
      ],
      origin,
      now,
    );
    expect(validTodayFirst(placed, now).map((o) => o.id)).toEqual([
      "always",
      "wednesday",
      "today-bag",
      "lunch-on",
      "monday",
      "tomorrow-bag",
      "lunch-over",
    ]);
  });
});

describe("featuredPinIds", () => {
  const pin = (venueId: string, lat: number, bestDiscount: number | null, minPrice: number | null = 10) => ({
    venueId,
    name: venueId,
    lat,
    lon: 26.1,
    minPrice,
    bestDiscount,
    count: 1,
  });

  it("features the deepest discounts with a price, spread apart", () => {
    const featured = featuredPinIds([
      pin("deep", 44.43, 70),
      pin("next-door", 44.4301, 65),
      pin("across-town", 44.45, 50),
      pin("no-price", 44.47, 90, null),
      pin("no-discount", 44.49, null),
    ], 400);
    expect([...featured]).toEqual(["deep", "across-town"]);
  });

  it("stops at ten", () => {
    const many = Array.from({ length: 30 }, (_, index) => pin(`p${index}`, 44.3 + index * 0.01, 40));
    expect(featuredPinIds(many, 400).size).toBe(10);
  });
});

describe("availableWithinHour", () => {
  const now = new Date("2026-10-21T10:30:00Z");

  it("keeps bags whose pickup has started or starts within the hour", () => {
    const bag = { ...base, pickupStart: "2026-10-21T11:00:00Z", pickupEnd: "2026-10-21T13:00:00Z" };
    expect(availableWithinHour(bag, now)).toBe(true);
    expect(availableWithinHour({ ...bag, pickupStart: "2026-10-21T12:00:00Z" }, now)).toBe(false);
    expect(availableWithinHour({ ...bag, pickupStart: "2026-10-21T09:00:00Z", pickupEnd: "2026-10-21T10:00:00Z" }, now)).toBe(false);
  });

  it("reads deal hours and days in Bucharest time", () => {
    const deal = { ...base, pickupStart: null, pickupEnd: null, timeStart: "14:00", timeEnd: "16:00", daysOfWeek: null };
    expect(availableWithinHour(deal, now)).toBe(true);
    expect(availableWithinHour({ ...deal, timeStart: "15:00" }, now)).toBe(false);
    expect(availableWithinHour({ ...deal, timeEnd: "13:30", timeStart: "11:00" }, now)).toBe(false);
    expect(availableWithinHour({ ...deal, daysOfWeek: [1] }, now)).toBe(false);
    expect(availableWithinHour({ ...deal, timeStart: "22:00", timeEnd: "02:00" }, now)).toBe(false);
    expect(availableWithinHour({ ...deal, timeStart: "14:00", timeEnd: "02:00" }, now)).toBe(true);
  });
});
