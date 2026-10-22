import { OFFER_KINDS, type OfferKind } from "@fentezfoamea/core";

export type SortKey = "distance" | "discount" | "price";

export type ExploreState = {
  kinds: OfferKind[];
  radiusKm: number | null;
  maxPrice: number | null;
  sort: SortKey;
  includeDelivery: boolean;
  venueId: string | null;
  offerId: string | null;
};

export type ExploreSearch = {
  tip?: string;
  km?: number | string;
  buget?: number;
  ordine?: string;
  livrare?: string;
  local?: string;
  oferta?: string;
};

export const RADIUS_OPTIONS = [1, 3, 10, null] as const;
export const BUDGET_OPTIONS = [15, 25, 40, null] as const;

export const DEFAULT_STATE: ExploreState = {
  kinds: [],
  radiusKm: 3,
  maxPrice: null,
  sort: "distance",
  includeDelivery: true,
  venueId: null,
  offerId: null,
};

const SORT_PARAMS: Record<SortKey, string> = { distance: "aproape", discount: "reducere", price: "pret" };
const KIND_PARAMS: Record<OfferKind, string> = {
  surplus: "anti-risipa",
  discount: "reduceri",
  combo: "combo",
  daily_menu: "meniul-zilei",
  happy_hour: "happy-hour",
  coupon: "cupoane",
};
const CITYWIDE = "oras";

export function kindParam(kind: OfferKind): string {
  return KIND_PARAMS[kind];
}

export function validateSearch(raw: Record<string, unknown>): ExploreSearch {
  const text = (key: keyof ExploreSearch) => (typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : undefined);
  const number = (key: keyof ExploreSearch) => {
    const value = Number(raw[key]);
    return raw[key] !== undefined && raw[key] !== "" && Number.isFinite(value) ? value : undefined;
  };
  const search: ExploreSearch = {
    tip: text("tip"),
    km: raw.km === CITYWIDE ? CITYWIDE : number("km"),
    buget: number("buget"),
    ordine: text("ordine"),
    livrare: text("livrare"),
    local: text("local"),
    oferta: text("oferta"),
  };
  for (const key of Object.keys(search) as (keyof ExploreSearch)[]) if (search[key] === undefined) delete search[key];
  return search;
}

export function stateFromSearch(search: ExploreSearch): ExploreState {
  return {
    kinds: parseKinds(search.tip),
    radiusKm: parseRadius(search.km),
    maxPrice: BUDGET_OPTIONS.find((option) => option !== null && option === Number(search.buget)) ?? null,
    sort: findKey(SORT_PARAMS, search.ordine) ?? DEFAULT_STATE.sort,
    includeDelivery: search.livrare !== "nu",
    venueId: search.local ?? null,
    offerId: search.oferta ?? null,
  };
}

export function searchFromState(state: ExploreState): ExploreSearch {
  const search: ExploreSearch = {};
  if (state.kinds.length) search.tip = OFFER_KINDS.filter((kind) => state.kinds.includes(kind)).map(kindParam).join(",");
  if (state.radiusKm !== DEFAULT_STATE.radiusKm) search.km = state.radiusKm ?? CITYWIDE;
  if (state.maxPrice !== null) search.buget = state.maxPrice;
  if (state.sort !== DEFAULT_STATE.sort) search.ordine = SORT_PARAMS[state.sort];
  if (!state.includeDelivery) search.livrare = "nu";
  if (state.venueId) search.local = state.venueId;
  if (state.offerId) search.oferta = state.offerId;
  return search;
}

function parseKinds(value: string | undefined): OfferKind[] {
  if (!value) return [];
  const wanted = value.split(",");
  return OFFER_KINDS.filter((kind) => wanted.includes(KIND_PARAMS[kind]));
}

function parseRadius(value: number | string | undefined): number | null {
  if (value === CITYWIDE) return null;
  const km = Number(value);
  return RADIUS_OPTIONS.find((option) => option === km) ?? DEFAULT_STATE.radiusKm;
}

function findKey<K extends string>(map: Record<K, string>, value: string | undefined): K | undefined {
  return (Object.keys(map) as K[]).find((key) => map[key] === value);
}
