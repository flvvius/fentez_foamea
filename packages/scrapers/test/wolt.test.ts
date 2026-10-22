import { readFileSync } from "node:fs";
import { scrapedOfferSchema } from "@fentezfoamea/core";
import { describe, expect, it } from "vitest";
import {
  withoutWoltPlusUpsell,
  campaignConditions,
  campaignOffer,
  isLunchWithListedItems,
  lunchItemOffers,
  isMerchantCampaign,
  itemOffers,
  listVenues,
  rotationWindow,
  weeklySchedule,
  type WoltAssortment,
  type WoltCampaign,
  type WoltListVenue,
} from "../src/sources/wolt.ts";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/wolt/${name}`, import.meta.url), "utf8")) as T;
}

const papaGyros: WoltListVenue = {
  id: "67dad3a2db56261b0e642333",
  slug: "papa-gyros-rahova-67dad3a2db56261b0e642333",
  name: "Papa Gyros Rahova",
  address: "Calea Rahovei 286",
  location: [26.0681, 44.4141],
};

const campaigns = (name: string) => fixture<{ venue_raw: { discounts: WoltCampaign[] } }>(name).venue_raw.discounts;

describe("wolt", () => {
  it("reads venues from the restaurant list", () => {
    const venues = listVenues(fixture("restaurants.json"));
    expect(venues).toHaveLength(6);
    expect(venues[0]).toMatchObject({ name: "McDonald's Unirea", location: [26.104825, 44.428477] });
  });

  it("drops platform-wide new-user campaigns", () => {
    const merchant = campaigns("dynamic-burgerescu.json").filter(isMerchantCampaign);
    expect(merchant.map((campaign) => campaign.description.title)).toEqual([
      "Prânzul sub 40 lei",
      "35% reducere pentru articolele selectate",
    ]);
  });

  it("maps the lunch campaign to a weekday time window", () => {
    const lunch = campaigns("dynamic-burgerescu.json").find((campaign) => campaign.description.title.startsWith("Prânzul"))!;
    const offer = scrapedOfferSchema.parse(campaignOffer(papaGyros, lunch));
    expect(offer).toMatchObject({
      kind: "daily_menu",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      timeStart: "10:00",
      timeEnd: "16:00",
      deliveryOnly: true,
      endsAt: undefined,
      conditions: "doar la produsele selectate; doar în raza de 3 km",
    });
    expect(offer.sourceOfferId).toBe("venue_campaign:6a829ee73479caf4691dee09@67dad3a2db56261b0e642333");
  });

  it("lists the lunch items a lunch campaign names, under its price cap", () => {
    const lunch = campaigns("dynamic-burgerescu.json").find((campaign) => campaign.description.title.startsWith("Prânzul"))!;
    expect(isLunchWithListedItems(lunch)).toBe(true);
    const item = (id: string, name: string, price: number) => ({ id, name, price, disabled_info: null });
    const assortment: WoltAssortment = {
      categories: [],
      items: [
        item("69084dd928ad5f69bbbb56fb", "Meniu prânz burger", 3900),
        item("69084dd928ad5f69bbbb56fd", "Meniu prânz wrap", 3500),
        item("69084dd928ad5f69bbbb5703", "Platou mare", 5900),
        item("not-listed", "Burger", 2500),
      ],
    };
    const offers = lunchItemOffers(papaGyros, lunch, assortment).map((offer) => scrapedOfferSchema.parse(offer));
    expect(offers.map((offer) => [offer.title, offer.priceRon, offer.kind])).toEqual([
      ["Meniu prânz burger", 39, "daily_menu"],
      ["Meniu prânz wrap", 35, "daily_menu"],
    ]);
    expect(offers[0]).toMatchObject({ timeStart: "10:00", timeEnd: "16:00", description: "Prânzul sub 40 lei", deliveryOnly: true });
  });

  it("keeps a dated end and flags the Wolt+ upsell", () => {
    const deal = campaigns("dynamic-papa-gyros.json").find(isMerchantCampaign);
    const offer = scrapedOfferSchema.parse(campaignOffer(papaGyros, deal!));
    expect(offer.endsAt).toBe("2026-10-31T21:59:59.999Z");
    expect(offer.conditions).toContain("doar cu Wolt+");
    expect(offer.title).not.toContain("Wolt+");
    expect(offer.url).toBe("https://wolt.com/ro/rou/bucharest/restaurant/papa-gyros-rahova-67dad3a2db56261b0e642333");
    expect(offer.venue).toMatchObject({ lat: 44.4141, lon: 26.0681, chain: "Papa Gyros" });
  });

  it("skips free-delivery campaigns, which are not a food deal", () => {
    const deal = campaigns("dynamic-papa-gyros.json").find(isMerchantCampaign)!;
    for (const title of ["0 RON taxă de livrare", "Livrare gratuită"]) {
      expect(isMerchantCampaign({ ...deal, description: { ...deal.description, title } })).toBe(false);
    }
  });

  it("drops the Wolt+ upsell from campaign titles", () => {
    expect(withoutWoltPlusUpsell("20% la articolele selectate | 40% cu Wolt+")).toBe("20% la articolele selectate");
    expect(withoutWoltPlusUpsell("20% reducere pentru toate articolele | 30% with W+")).toBe("20% reducere pentru toate articolele");
    expect(withoutWoltPlusUpsell("-20% la tot meniul")).toBe("-20% la tot meniul");
  });

  it("prices discounted items from the assortment, biggest saving first", () => {
    const merchant = campaigns("dynamic-papa-gyros.json").filter(isMerchantCampaign);
    const offers = itemOffers(papaGyros, merchant, fixture<WoltAssortment>("assortment-papa-gyros.json"));
    expect(offers.map((offer) => [offer.title, offer.priceRon, offer.originalPriceRon])).toEqual([
      ["Gyros vita", 38.5, 55],
      ["Gyros pui", 35.7, 51],
      ["Pita Gyros vita", 34.3, 49],
      ["Pita Gyros pui", 33.25, 47.5],
    ]);
    expect(offers.every((offer) => scrapedOfferSchema.safeParse(offer).success)).toBe(true);
  });

  it("writes conditions without restating campaign-wide or item-level scope", () => {
    const deal = campaigns("dynamic-papa-gyros.json").find(isMerchantCampaign);
    const shortPlus = { ...deal!, description: { ...deal!.description, title: "20% la articolele selectate | 30% cu W+" } };
    const allItems = { ...deal!, description: { ...deal!.description, title: "40% reducere pentru toate articolele" } };
    expect(campaignConditions(shortPlus)).toBe("doar la produsele selectate; reducerea mai mare e doar cu Wolt+");
    expect(campaignConditions(allItems)).toBeUndefined();
    expect(campaignConditions(deal!, { forItem: true })).toBe("reducerea mai mare e doar cu Wolt+");
  });

  it("skips add-ons under 15 lei when picking discounted items", () => {
    const deal = campaigns("dynamic-papa-gyros.json").find(isMerchantCampaign);
    const sauce = { id: "sauce", name: "Sos usturoi", price: 600, disabled_info: null };
    const withSauce = { ...deal!, effects: { ...deal!.effects, item_discount: { ...deal!.effects.item_discount!, include: { categories: null, items: ["sauce", "ad55cba185bbec9fa20cab11"] } } } };
    const offers = itemOffers(papaGyros, [withSauce], { categories: [], items: [sauce, ...fixture<WoltAssortment>("assortment-papa-gyros.json").items] });
    expect(offers.map((offer) => offer.title)).toEqual(["Pita Gyros pui"]);
  });

  it("only maps weekly windows that share one daily time range", () => {
    expect(weeklySchedule([{ start: 720, end: 900 }, { start: 2160, end: 2340 }])).toEqual({
      daysOfWeek: [1, 2],
      timeStart: "12:00",
      timeEnd: "15:00",
    });
    expect(weeklySchedule([{ start: 720, end: 900 }, { start: 2100, end: 2340 }])).toEqual({});
    expect(weeklySchedule(null)).toEqual({});
  });
});

describe("rotationWindow", () => {
  it("walks through every venue across consecutive slots", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const seen = new Set([0, 1, 2, 3].flatMap((slot) => rotationWindow(items, 3, slot)));
    expect(seen.size).toBe(10);
    expect(rotationWindow(items, 3, 3)).toEqual([9, 0, 1]);
  });

  it("returns everything when the list fits", () => {
    expect(rotationWindow([1, 2], 5, 7)).toEqual([1, 2]);
  });
});
