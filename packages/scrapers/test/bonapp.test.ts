import { describe, expect, it } from "vitest";
import { toOffer } from "../src/sources/bonapp.ts";

const product = {
  id: "23353-eu1",
  name: "Surprise Box  Chicken",
  stock_quantity: 2,
  price_formatted: 1600,
  regular_price_formatted: 3200,
  currency: "RON",
  vendor: { id: "v1", name: "Chopstix • Unirii", address: { street_1: "Piața Unirii 1", city: "București" } },
  latitude: "44.4268",
  longitude: "26.1025",
  pickup_intervals: "21:40 - 22:00",
  pickup_date: "2026-10-21",
  slug: "surprise-box-chicken-10-eu1",
};

describe("bonapp toOffer", () => {
  it("links to the shop's singular product route", () => {
    expect(toOffer(product)?.url).toBe("https://shop.munch.eco/ro/product/surprise-box-chicken-10-eu1");
  });

  it("reads prices from minor units and the pickup window in Bucharest time", () => {
    expect(toOffer(product)).toMatchObject({
      title: "Surprise Box Chicken",
      priceRon: 16,
      originalPriceRon: 32,
      pickupStart: "2026-10-21T18:40:00.000Z",
      pickupEnd: "2026-10-21T19:00:00.000Z",
      availableCount: 2,
    });
  });

  it("skips sold-out bags", () => {
    expect(toOffer({ ...product, stock_quantity: 0 })).toBeUndefined();
  });
});
