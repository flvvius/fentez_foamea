import { readFileSync } from "node:fs";
import { scrapedOfferSchema } from "@fentezfoamea/core";
import { describe, expect, it } from "vitest";
import { dominosOffers, parseDominosDeals, parseDominosStores } from "../src/sources/dominos.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/dominos/${name}`, import.meta.url), "utf8");
const home = fixture("home.html");
const storesPage = fixture("stores.html");

describe("domino's", () => {
  it("reads every homepage deal", () => {
    const deals = parseDominosDeals(home);
    expect(deals.map((deal) => deal.dealId)).toEqual(["1565", "4680", "4692", "4694", "1777"]);
    expect(deals[1]).toMatchObject({ title: "Pizza Break", kind: "combo", daysOfWeek: [1, 2, 3, 4] });
    expect(deals[0]).toMatchObject({ title: "Plătești 3 și primești 4 pizza", priceRon: undefined, daysOfWeek: undefined });
  });

  it("does not show the price of an add-on as the price of the deal", () => {
    const [, pizzaBreak, summerCombo] = parseDominosDeals(home);
    expect(pizzaBreak?.priceRon).toBeUndefined();
    expect(summerCombo).toMatchObject({
      title: "Summer Combo",
      priceRon: undefined,
      conditions: "2,99 lei e prețul produsului în plus, doar împreună cu o pizza la preț întreg",
    });
  });

  it("keeps Bucharest stores and leaves coordinates to the geocoder", () => {
    const stores = parseDominosStores(storesPage);
    expect(stores.map((store) => store.name)).toEqual([
      "Domino's Brancoveanu",
      "Domino's Budisteanu",
      "Domino's Chitila",
      "Domino's Colentina",
      "Domino's Cosmopolis",
      "Domino's Eroii Revolutiei",
    ]);
    expect(stores[0]).toMatchObject({
      address: "Strada Nitu Vasile 39, București",
      url: "https://www.dominos-pizza.ro/menu/bucharest-brancoveanu",
    });
    expect(stores[0]?.lat).toBeUndefined();
  });

  it("links each offer to its store menu", () => {
    const offers = dominosOffers(home, storesPage);
    expect(offers).toHaveLength(30);
    expect(offers[0]).toMatchObject({ sourceOfferId: "1565@bucharest-brancoveanu", url: "https://www.dominos-pizza.ro/menu/bucharest-brancoveanu" });
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });
});
