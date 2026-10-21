import { readFileSync } from "node:fs";
import { scrapedOfferSchema } from "@fentezfoamea/core";
import { describe, expect, it } from "vitest";
import { parsePaulDeal, parsePaulOfferLinks, parsePaulStores, paulOffers } from "../src/sources/paul.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/paul/${name}`, import.meta.url), "utf8");
const deal = (id: number) => parsePaulDeal(fixture(`offer-${id}.html`), `https://www.paul.ro/ro/paul-offres/${id}.html`)!;
const stores = parsePaulStores(fixture("stores.xml"));

describe("paul", () => {
  it("collects unique offer pages from both listing pages", () => {
    expect(parsePaulOfferLinks(fixture("list-p1.html"))).toHaveLength(9);
    expect(parsePaulOfferLinks(fixture("list-p2.html"))).toEqual([
      "https://www.paul.ro/ro/paul-offres/385.html",
      "https://www.paul.ro/ro/paul-offres/389.html",
      "https://www.paul.ro/ro/paul-offres/390.html",
    ]);
  });

  it("reads the bakeries with coordinates", () => {
    expect(stores).toHaveLength(11);
    expect(stores[0]).toMatchObject({
      sourceVenueId: "977",
      name: "PAUL Băneasa",
      address: "Șoseaua București - Ploiești nr. 42D, Băneasa Shopping City (parter)",
      lat: 44.507152,
      chain: "Paul",
    });
    expect(stores.find((store) => store.sourceVenueId === "978")?.name).toBe("Chariot Băneasa (PAUL)");
  });

  it("reads the Monday éclair price without the Tuesday note", () => {
    expect(deal(402)).toMatchObject({ title: "Oferte LUNI", priceRon: 12.9, daysOfWeek: [1], kind: "discount" });
  });

  it("reads the lunch menu", () => {
    expect(deal(401)).toMatchObject({ kind: "daily_menu", priceRon: 26, daysOfWeek: undefined });
  });

  it("keeps an expired validity window so the site hides it", () => {
    expect(deal(298)).toMatchObject({ kind: "combo", priceRon: 51, endsAt: "2025-12-31T21:59:00.000Z", daysOfWeek: [2, 3, 4, 5, 6, 7] });
  });

  it("limits store-specific deals to that bakery", () => {
    const offers = paulOffers(deal(350), stores);
    expect(offers.map((offer) => offer.venue?.name)).toEqual(["PAUL Universitate"]);
    expect(offers[0]).toMatchObject({ sourceOfferId: "350@983", daysOfWeek: [1, 2], conditions: "Doar la PAUL Universitate" });
  });

  it("falls back to a national offer when the named bakery is unknown", () => {
    const offers = paulOffers(deal(390), stores);
    expect(offers).toEqual([expect.objectContaining({ sourceOfferId: "390", venue: null, priceRon: 14, conditions: "Doar la PAUL Sun Plaza" })]);
  });

  it("emits valid offers for every bakery otherwise", () => {
    const offers = paulOffers(deal(401), stores);
    expect(offers).toHaveLength(11);
    for (const offer of offers) expect(scrapedOfferSchema.safeParse(offer).success).toBe(true);
  });
});
