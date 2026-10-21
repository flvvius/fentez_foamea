import { describe, expect, it } from "vitest";
import { coordinatesFromMapsUrl, offerToOffers, toStore, type TacoBellOffer, type TacoBellRestaurant } from "../src/sources/tacobell.ts";
import { mergeNodes } from "../src/sveltekit.ts";
import offersPage from "./fixtures/tacobell/oferte.data.json";
import restaurantsPage from "./fixtures/tacobell/restaurante.data.json";

const offers = mergeNodes(offersPage).offers as TacoBellOffer[];
const restaurants = mergeNodes(restaurantsPage).restaurants as TacoBellRestaurant[];
const stores = restaurants.flatMap((restaurant) => toStore(restaurant) ?? []);

describe("tacobell", () => {
  it("prefers the place pin over the map viewport", () => {
    expect(
      coordinatesFromMapsUrl("https://www.google.ro/maps/place/Taco+Bell/@44.4303514,26.050482,17z/data=!3m1!4b1!3d44.4303476!4d26.0526707"),
    ).toEqual({ lat: 44.4303476, lon: 26.0526707 });
    expect(coordinatesFromMapsUrl("https://www.google.com/maps/place/X/@44.47,26.10,18z")).toEqual({ lat: 44.47, lon: 26.1 });
  });

  it("keeps restaurants by coordinates, not by the city label", () => {
    expect(stores.map((store) => store.id)).toEqual([
      "taco-bell-afi-cotroceni",
      "taco-bell-plaza-romania",
      "taco-bell-promenada-mall",
      "taco-bell-baneasa-shopping-city",
      "taco-bell-mega-mall",
      "taco-bell-park-lake-shopping-center",
    ]);
  });

  it("maps a weekday 1+1 deal to every Bucharest restaurant", () => {
    const burrito = offers.find((offer) => offer.slug === "burrito-day")!;
    const emitted = offerToOffers(burrito, stores);
    expect(emitted).toHaveLength(6);
    expect(emitted[0]).toMatchObject({
      sourceOfferId: "burrito-day@taco-bell-afi-cotroceni",
      kind: "combo",
      priceRon: 26,
      daysOfWeek: [3],
      url: "https://taco-bell.ro/oferte/burrito-day",
      venue: { chain: "Taco Bell", name: "Taco Bell AFI Cotroceni" },
    });
  });

  it("marks click and collect deals", () => {
    const monday = offers.find((offer) => offer.slug === "luneacalumea")!;
    expect(offerToOffers(monday, stores)[0]).toMatchObject({
      priceRon: 13.5,
      daysOfWeek: [1],
      conditions: "Doar la comandă online cu ridicare",
    });
  });
});
