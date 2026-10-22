import { describe, expect, it } from "vitest";
import { scrapedOfferSchema } from "@fentezfoamea/core";
import {
  addressFromInfoScreen,
  cheapestDiscountedItems,
  formatGlovoAddress,
  glovoHeaders,
  itemOffers,
  minimumBasketFor,
  productRows,
  rotate,
  storeOffers,
  toOutlet,
  toVenue,
  type StoreDetails,
  type WallEntry,
} from "../src/sources/glovo.ts";
import wall from "./fixtures/glovo/wall.json";
import store from "./fixtures/glovo/store.json";
import infoScreen from "./fixtures/glovo/info-screen.json";
import promoItems from "./fixtures/glovo/promo-items.json";

const entries = wall.data.stores.entries as WallEntry[];
const byslug = (slug: string) => entries.find((entry) => entry.slug === slug)!;

describe("glovo outlets", () => {
  it("keeps public promos and drops Prime-only or promo-less stores", () => {
    const outlets = entries.map(toOutlet);
    expect(outlets.filter(Boolean).map((outlet) => outlet!.slug)).toEqual(["zestpizza", "alma-buc", "domino-s-pizza-buc"]);
  });

  it("maps each promo type to a venue-level offer", () => {
    const titles = ["zestpizza", "alma-buc", "domino-s-pizza-buc"].map((slug) => {
      const outlet = toOutlet(byslug(slug))!;
      const [offer] = storeOffers(outlet, toVenue(outlet, undefined, false));
      return [offer!.kind, offer!.title, offer!.sourceOfferId];
    });
    expect(titles).toEqual([
      ["discount", "-50% la unele produse", "173705-521583:PERCENTAGE_DISCOUNT"],
      ["discount", "-30% la tot meniul", "600574-961540:BASKET_PERCENTAGE"],
      ["combo", "1+1 la unele produse", "264271-554152:TWO_FOR_ONE"],
    ]);
  });

  it("produces offers that pass the shared schema", () => {
    const outlet = toOutlet(byslug("zestpizza"))!;
    const venue = toVenue(outlet, "Calea Vitan 55-59, Bucharest", true);
    const [offer] = storeOffers(outlet, venue, 50);
    const parsed = scrapedOfferSchema.parse(offer);
    expect(parsed).toMatchObject({
      deliveryOnly: true,
      url: "https://glovoapp.com/ro/ro/bucharest/stores/zestpizza",
      conditions: "Comandă minimă 50 lei",
      venue: { sourceVenueId: "173705-521583", chain: "Zest Pizza" },
    });
  });
});

describe("glovo items", () => {
  const rows = productRows(promoItems);

  it("finds product rows anywhere in the content tree", () => {
    expect(rows).toHaveLength(9);
  });

  it("computes discounts from prices and keeps the cheapest five", () => {
    const picked = cheapestDiscountedItems(rows, 5);
    expect(picked.map(({ row, price }) => [row.name, price])).toEqual([
      ["COUNTRY WINGS 7", 32.49],
      ["COUNTRY WINGS HOT 7.", 32.49],
      ["DUBLU SMASHED BURGER  (RETETA NOUA)", 33.98],
      ["DUBLU BLACK TRUFFLE SMASHED", 34.48],
      ["HOMESTYLE CRISPY 5 ", 35.99],
    ]);
  });

  it("skips sides and sauces that cost under 15 lei before the discount", () => {
    const ketchup = { id: 3, name: "Ketchup 40g", price: 3, promotions: [{ type: "PERCENTAGE_DISCOUNT", price: 2.1 }] };
    const wrap = { id: 4, name: "Wrap", price: 30, promotions: [{ type: "PERCENTAGE_DISCOUNT", price: 21 }] };
    expect(cheapestDiscountedItems([ketchup, wrap], 5).map(({ row }) => row.name)).toEqual(["Wrap"]);
  });

  it("ignores Prime-only, 1+1 and out-of-stock items", () => {
    const prime = { id: 1, name: "Prime", price: 40, promotions: [{ type: "PERCENTAGE_DISCOUNT", price: 20, isPrime: true }] };
    const gone = { id: 2, name: "Gone", price: 40, outOfStock: true, promotions: [{ type: "PERCENTAGE_DISCOUNT", price: 20 }] };
    const pepsi = rows.find((row) => row.name.startsWith("Pepsi"))!;
    expect(cheapestDiscountedItems([prime, gone, pepsi], 5)).toEqual([]);
  });

  it("emits item offers with original and promo price", () => {
    const outlet = toOutlet(byslug("zestpizza"))!;
    const [offer] = itemOffers(outlet, toVenue(outlet, undefined, false), rows);
    expect(scrapedOfferSchema.parse(offer)).toMatchObject({
      sourceOfferId: "173705-521583:item:42370150901",
      kind: "discount",
      title: "COUNTRY WINGS 7",
      priceRon: 32.49,
      originalPriceRon: 45.99,
    });
  });
});

describe("glovo helpers", () => {
  it("reads the address from store details and the info screen", () => {
    expect(formatGlovoAddress((store as StoreDetails).address!)).toBe("Calea Vitan 55-59, Bucharest");
    expect(formatGlovoAddress(addressFromInfoScreen(infoScreen)!)).toBe("Calea Vitan 55-59, Bucharest");
    expect(formatGlovoAddress("Strada Lipscani 10")).toBe("Strada Lipscani 10, București");
    expect(formatGlovoAddress("Strada Baia de Fier 6\nBucurești 030167\nRomania")).toBe("Strada Baia de Fier 6, București");
    expect(formatGlovoAddress("Bulevardul Regina Elisabeta 23\nBucurești București")).toBe("Bulevardul Regina Elisabeta 23, București");
  });

  it("ignores the first-order free delivery promo when reading minimum basket", () => {
    expect(minimumBasketFor(store as StoreDetails)).toBeUndefined();
    expect(minimumBasketFor({ id: 1, addressId: 2, promotions: [{ type: "BASKET_PERCENTAGE", minimumBasketSizeCents: 6000 }] })).toBe(60);
  });

  it("rotates keys deterministically per day", () => {
    const keys = ["a", "b", "c", "d", "e"];
    expect(rotate(keys, "2026-10-21")).toEqual(rotate(keys, "2026-10-21"));
    expect(rotate(keys, "2026-10-21")).not.toEqual(rotate(keys, "2026-10-22"));
  });

  it("sends location headers only when a point is given", () => {
    expect(glovoHeaders()).not.toHaveProperty("glovo-delivery-location-latitude");
    expect(glovoHeaders({ lat: 44.4, lon: 26.1 })).toMatchObject({ "glovo-delivery-location-latitude": "44.4" });
  });
});
