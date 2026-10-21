import { describe, expect, it } from "vitest";
import { bucharestStores, cityList, dealToOffers, dealsFromHeroes, dealsFromOffers, type KfcHero, type KfcOffer } from "../src/sources/kfc.ts";
import cities from "./fixtures/kfc/cities.json";
import heroes from "./fixtures/kfc/heroes.json";
import offers from "./fixtures/kfc/offers.json";

const offerList = offers.data.map((entry) => entry.attributes) as KfcOffer[];
const heroList = heroes.data.map((entry) => entry.attributes) as KfcHero[];
const now = new Date("2026-10-21T10:00:00Z");

describe("kfc", () => {
  const stores = bucharestStores(cityList(cities));

  it("keeps only Bucharest restaurants", () => {
    expect(stores.map((store) => store.id)).toContain("kfc-promenada");
    expect(stores.some((store) => store.id.startsWith("kfc-alba-iulia"))).toBe(false);
    expect(stores.every((store) => store.lat > 44 && store.lon > 25)).toBe(true);
  });

  it("emits a national deal at every Bucharest store with its price", () => {
    const [topMenu] = dealsFromOffers(offerList, now);
    const emitted = dealToOffers(topMenu!, stores);
    expect(emitted).toHaveLength(stores.length);
    expect(emitted[0]).toMatchObject({
      sourceOfferId: `fa-afacere-cu-top-menu@${stores[0]!.id}`,
      kind: "combo",
      priceRon: 19.9,
      endsAt: "2026-11-11T22:00:00.000Z",
      url: "https://kfc.ro/ofertepebune/fa-afacere-cu-top-menu",
      venue: { chain: "KFC" },
    });
  });

  it("limits a selected-stores deal to the participating restaurants", () => {
    const deal = dealsFromOffers(offerList, now).find((d) => d.slug === "poftaladublu")!;
    const emitted = dealToOffers(deal, stores);
    expect(emitted.map((offer) => offer.venue?.sourceVenueId)).toEqual(["kfc-promenada"]);
    expect(emitted[0]?.conditions).toBe("Nu se aplică la livrare; Doar în restaurantele participante");
    expect(emitted[0]?.description).toMatch(/^Cumpără un Dublu Booster/);
  });

  it("drops expired deals", () => {
    expect(dealsFromOffers(offerList, new Date("2026-12-01T00:00:00Z"))).toEqual([]);
  });

  it("skips hero banners that repeat an offer, have ended or carry no deal", () => {
    expect(dealsFromHeroes(heroList, offerList, now)).toEqual([]);
  });

  it("keeps a live hero deal with weekdays and a delivery exclusion", () => {
    const deals = dealsFromHeroes(heroList, offerList, new Date("2026-10-13T10:00:00Z"));
    const bucket = deals.find((deal) => deal.slug === "marti-bucket")!;
    const [offer] = dealToOffers(bucket, stores);
    expect(offer).toMatchObject({ priceRon: 33, daysOfWeek: [1, 2, 3, 4, 5], conditions: "Nu se aplică la livrare" });
  });
});
