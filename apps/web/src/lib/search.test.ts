import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, searchFromState, stateFromSearch, validateSearch } from "./search";

describe("explore search params", () => {
  it("keeps the default view out of the URL", () => {
    expect(searchFromState(DEFAULT_STATE)).toEqual({});
    expect(stateFromSearch({})).toEqual(DEFAULT_STATE);
  });

  it("round-trips every filter", () => {
    const state = {
      kinds: ["surplus", "daily_menu"] as const,
      radiusKm: null,
      maxPrice: 25,
      sort: "price" as const,
      includeDelivery: false,
      venueId: "v1",
      offerId: "o1",
    };
    const search = searchFromState({ ...state, kinds: [...state.kinds] });
    expect(search).toEqual({ tip: "anti-risipa,meniul-zilei", km: "oras", buget: 25, ordine: "pret", livrare: "nu", local: "v1", oferta: "o1" });
    expect(stateFromSearch(search)).toEqual({ ...state, kinds: [...state.kinds] });
  });

  it("reads numbers whether the router parsed them or not", () => {
    expect(stateFromSearch(validateSearch({ km: "10", buget: 15 }))).toMatchObject({ radiusKm: 10, maxPrice: 15 });
  });

  it("ignores values it does not know", () => {
    expect(stateFromSearch(validateSearch({ tip: "pizza", km: 7, buget: 13, ordine: "random", extra: "x" }))).toEqual(DEFAULT_STATE);
  });
});
