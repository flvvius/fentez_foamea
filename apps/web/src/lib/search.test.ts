import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, searchForPage, searchFromState, stateForPage, stateFromSearch, validateSearch } from "./search";

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
      query: "la mama",
    };
    const search = searchFromState({ ...state, kinds: [...state.kinds] });
    expect(search).toEqual({ tip: "anti-risipa,meniul-zilei", km: "oras", buget: 25, ordine: "pret", livrare: "nu", local: "v1", oferta: "o1", q: "la mama" });
    expect(stateFromSearch(search)).toEqual({ ...state, kinds: [...state.kinds] });
  });

  it("reads numbers whether the router parsed them or not", () => {
    expect(stateFromSearch(validateSearch({ km: "10", buget: 15 }))).toMatchObject({ radiusKm: 10, maxPrice: 15 });
  });

  it("ignores values it does not know", () => {
    expect(stateFromSearch(validateSearch({ tip: "pizza", km: 7, buget: 13, ordine: "random", extra: "x" }))).toEqual(DEFAULT_STATE);
  });
});

describe("pages with their own defaults", () => {
  const zone = { radiusKm: 1 };
  const landing = { kinds: ["surplus" as const] };

  it("leaves a page's own defaults out of its URL", () => {
    expect(searchForPage(stateForPage({}, zone), zone)).toEqual({});
    expect(searchForPage(stateForPage({}, landing), landing)).toEqual({});
  });

  it("writes the site-wide default radius on a zone page, since the zone's is different", () => {
    const state = { ...stateForPage({}, zone), radiusKm: 3 };
    expect(searchForPage(state, zone)).toEqual({ km: 3 });
    expect(stateForPage(validateSearch({ km: 3 }), zone).radiusKm).toBe(3);
    expect(searchForPage({ ...state, radiusKm: null }, zone)).toEqual({ km: "oras" });
  });

  it("remembers that every kind was picked on a category page", () => {
    const search = searchForPage({ ...stateForPage({}, landing), kinds: [] }, landing);
    expect(search).toEqual({ tip: "toate" });
    expect(stateForPage(validateSearch(search), landing).kinds).toEqual([]);
  });
});
