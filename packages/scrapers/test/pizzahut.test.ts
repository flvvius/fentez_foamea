import { readFileSync } from "node:fs";
import { scrapedOfferSchema } from "@fentezfoamea/core";
import { describe, expect, it } from "vitest";
import { pizzaHutOffers, toPizzaHutDeal, toPizzaHutStore, type PizzaHutLocation, type PizzaHutProduct } from "../src/sources/pizzahut.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/pizzahut/${name}`, import.meta.url), "utf8"));
const products: PizzaHutProduct[] = fixture("deals.json").data.categories[0].products;
const locations: PizzaHutLocation[] = fixture("locations.json").data;
const byName = (name: string) => products.find((product) => product.name === name)!;

describe("pizza hut", () => {
  it("keeps only Bucharest restaurants", () => {
    const stores = locations.map(toPizzaHutStore).filter(Boolean);
    expect(stores.map((store) => store!.sourceVenueId)).toEqual(["256", "257", "281"]);
    expect(stores[1]).toMatchObject({ name: "Pizza Hut Bucuresti Dorobanți", chain: "Pizza Hut", lat: 44.44674829777444 });
  });

  it("drops plain products that sit in the offers category", () => {
    expect(toPizzaHutDeal(byName("Spooky Bites"))).toBeUndefined();
  });

  it("reads weekday deals with pickup conditions", () => {
    expect(toPizzaHutDeal(byName("Marți: orice pizza mică 19.5 lei"))).toMatchObject({
      dealId: "24453",
      kind: "discount",
      priceRon: 19.5,
      daysOfWeek: [2],
      conditions: "Disponibil doar la ridicare",
    });
    expect(toPizzaHutDeal(byName("Miercuri: Orice portie de paste 24.90 lei"))).toMatchObject({ daysOfWeek: [3], priceRon: 24.9 });
  });

  it("marks 1+1 and menus as combos without inventing prices", () => {
    expect(toPizzaHutDeal(byName("Luni 1+1 cadou"))).toMatchObject({ kind: "combo", daysOfWeek: [1], priceRon: undefined });
    expect(toPizzaHutDeal(byName("Duo Mix"))).toMatchObject({ kind: "combo", priceRon: 65, daysOfWeek: undefined });
  });

  it("emits one valid offer per deal and store", () => {
    const offers = pizzaHutOffers(products, locations);
    const deals = products.map((product) => toPizzaHutDeal(product)).filter(Boolean).length;
    expect(offers).toHaveLength(deals * 3);
    expect(offers[0]?.sourceOfferId).toMatch(/^\d+@256$/);
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });
});
