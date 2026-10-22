import { distanceMeters, type LatLon } from "@fentezfoamea/core";
import { bucharestClock, bucharestWeekday, sameBucharestDay } from "@/lib/format";
import type { Offer } from "@/lib/offers";
import type { ExploreState, SortKey } from "@/lib/search";

export type PlacedOffer = Offer & {
  placeId: string | null;
  distance: number | null;
  headlinePct: number | null;
  priceCap: number | null;
  otherLocations?: number;
  alsoSoldAs?: string[];
};

export type VenuePin = {
  venueId: string;
  name: string;
  lat: number;
  lon: number;
  minPrice: number | null;
  bestDiscount: number | null;
  count: number;
};

export function isStillAvailable(offer: Offer, now: Date): boolean {
  const end = offer.pickupEnd ?? offer.endsAt;
  return !end || new Date(end).getTime() > now.getTime();
}

export function placeOffers(offers: Offer[], origin: LatLon, now: Date): PlacedOffer[] {
  const places = samePlaceIds(offers);
  return offers
    .filter((offer) => isStillAvailable(offer, now))
    .map((offer) => ({
      ...offer,
      placeId: offer.venueId && (places.get(offer.venueId) ?? offer.venueId),
      headlinePct: offer.discountPct ?? percentInTitle(offer.title),
      priceCap: offer.price === null ? priceCapInTitle(offer.title) : null,
      distance: offer.lat !== null && offer.lon !== null ? distanceMeters(origin, { lat: offer.lat, lon: offer.lon }) : null,
    }));
}

const SAME_PLACE_METERS = 150;

type VenueSpot = LatLon & { venueId: string };

export function samePlaceIds(offers: Offer[]): Map<string, string> {
  const spotsByName = new Map<string, Map<string, VenueSpot>>();
  for (const offer of offers) {
    if (!offer.venueId || !offer.venueName || offer.lat === null || offer.lon === null) continue;
    const name = comparableName(offer.venueName);
    const spots = spotsByName.get(name) ?? new Map<string, VenueSpot>();
    spots.set(offer.venueId, { venueId: offer.venueId, lat: offer.lat, lon: offer.lon });
    spotsByName.set(name, spots);
  }
  const placeIds = new Map<string, string>();
  for (const spots of spotsByName.values()) {
    const anchors: VenueSpot[] = [];
    for (const spot of [...spots.values()].sort((a, b) => a.venueId.localeCompare(b.venueId))) {
      const anchor = anchors.find((candidate) => distanceMeters(candidate, spot) <= SAME_PLACE_METERS);
      if (anchor) placeIds.set(spot.venueId, anchor.venueId);
      else anchors.push(spot);
    }
  }
  return placeIds;
}

function comparableName(name: string): string {
  return foldText(name).replace(/[^a-z0-9]/g, "");
}

type Filters = Pick<ExploreState, "kinds" | "radiusKm" | "maxPrice" | "includeDelivery"> & { query?: string };

export function applyFilters(offers: PlacedOffer[], filters: Filters): PlacedOffer[] {
  const words = searchWords(filters.query ?? "");
  return offers.filter((offer) => {
    if (words.length && !matchesWords(offer, words)) return false;
    if (filters.kinds.length && !filters.kinds.includes(offer.kind)) return false;
    if (!filters.includeDelivery && offer.deliveryOnly) return false;
    const price = comparablePrice(offer);
    if (filters.maxPrice !== null && (price === null || price > filters.maxPrice)) return false;
    if (filters.radiusKm !== null && !withinRadius(offer, filters.radiusKm)) return false;
    return true;
  });
}

function searchWords(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

export function matchesQuery(offer: Pick<Offer, "title" | "venueName" | "chain">, query: string): boolean {
  return matchesWords(offer, searchWords(query));
}

function matchesWords(offer: Pick<Offer, "title" | "venueName" | "chain">, words: string[]): boolean {
  const text = foldText(`${offer.title} ${offer.venueName ?? ""} ${offer.chain ?? ""}`);
  return words.every((word) => text.includes(word));
}

function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function withinRadius(offer: PlacedOffer, radiusKm: number): boolean {
  if (offer.distance === null) return offer.venueId === null;
  return offer.distance <= radiusKm * 1000;
}

const POINTS_LOST_PER_KM = 8;
const UNKNOWN_DISTANCE_M = 5000;

const TITLE_PERCENT = /(?:^|[\s-−])(\d{1,2})\s*%/;
const TITLE_PRICE_CAP = /\bsub\s+(\d{1,3})\s*lei\b/i;

export function percentInTitle(title: string): number | null {
  const match = TITLE_PERCENT.exec(title);
  return match ? Number(match[1]) : null;
}

export function priceCapInTitle(title: string): number | null {
  const match = TITLE_PRICE_CAP.exec(title);
  return match ? Number(match[1]) : null;
}

function comparablePrice(offer: PlacedOffer): number | null {
  return offer.price ?? offer.priceCap;
}

export function dealScore(offer: PlacedOffer): number {
  const discount = offer.headlinePct ?? 0;
  const priceKnown = offer.price === null ? -20 : 0;
  const rescuedBag = offer.kind === "surplus" ? 20 : 0;
  const deliveryOnly = offer.deliveryOnly ? -15 : 0;
  const km = (offer.distance ?? UNKNOWN_DISTANCE_M) / 1000;
  return discount + priceKnown + rescuedBag + deliveryOnly - POINTS_LOST_PER_KM * km;
}

const comparators: Record<SortKey, (a: PlacedOffer, b: PlacedOffer) => number> = {
  best: (a, b) => dealScore(b) - dealScore(a),
  distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
  discount: (a, b) => (b.headlinePct ?? -1) - (a.headlinePct ?? -1),
  price: (a, b) => (comparablePrice(a) ?? Infinity) - (comparablePrice(b) ?? Infinity),
};

const POINTS_LOST_PER_REPEAT = 12;

export function sortOffers(offers: PlacedOffer[], sort: SortKey): PlacedOffer[] {
  const sorted = [...offers].sort((a, b) => comparators[sort](a, b) || comparators.distance(a, b));
  return sort === "best" ? spreadVenues(sorted) : sorted;
}

function spreadVenues(ranked: PlacedOffer[]): PlacedOffer[] {
  const seenAtPlace = new Map<string, number>();
  const scored = ranked.map((offer, rank) => {
    const place = offer.placeId ?? offer.id;
    const repeats = seenAtPlace.get(place) ?? 0;
    seenAtPlace.set(place, repeats + 1);
    return { offer, rank, score: dealScore(offer) - POINTS_LOST_PER_REPEAT * repeats };
  });
  return scored.sort((a, b) => b.score - a.score || a.rank - b.rank).map(({ offer }) => offer);
}

export function venuePins(offers: PlacedOffer[]): VenuePin[] {
  const pins = new Map<string, VenuePin>();
  for (const offer of offers) {
    if (!offer.placeId || offer.lat === null || offer.lon === null) continue;
    const pin = pins.get(offer.placeId) ?? {
      venueId: offer.placeId,
      name: offer.venueName ?? "",
      lat: offer.lat,
      lon: offer.lon,
      minPrice: null,
      bestDiscount: null,
      count: 0,
    };
    pin.count++;
    if (offer.price !== null && (pin.minPrice === null || offer.price < pin.minPrice)) pin.minPrice = offer.price;
    if (offer.headlinePct !== null && (pin.bestDiscount === null || offer.headlinePct > pin.bestDiscount)) pin.bestDiscount = offer.headlinePct;
    pins.set(offer.placeId, pin);
  }
  return [...pins.values()];
}

export function collapseChainCopies(sorted: PlacedOffer[]): PlacedOffer[] {
  const firstByKey = new Map<string, PlacedOffer>();
  const result: PlacedOffer[] = [];
  for (const offer of sorted) {
    const key = copyKey(offer);
    if (!key) {
      result.push(offer);
      continue;
    }
    const first = firstByKey.get(key);
    if (first && !offer.chain) {
      const name = offer.venueName;
      if (name && name !== first.venueName && !first.alsoSoldAs?.includes(name)) first.alsoSoldAs = [...(first.alsoSoldAs ?? []), name];
      continue;
    }
    if (first) {
      first.otherLocations = (first.otherLocations ?? 0) + 1;
      continue;
    }
    const copy = { ...offer, otherLocations: 0, alsoSoldAs: [] };
    firstByKey.set(key, copy);
    result.push(copy);
  }
  return result;
}

function copyKey(offer: PlacedOffer): string | null {
  const deal = `${offer.source}|${offer.title}|${offer.price ?? ""}`;
  if (offer.chain) return `${deal}|${offer.chain}`;
  if (offer.lat === null || offer.lon === null) return null;
  return `${deal}|${offer.lat.toFixed(4)},${offer.lon.toFixed(4)}`;
}

export function validTodayFirst(offers: PlacedOffer[], now: Date): PlacedOffer[] {
  const weekday = bucharestWeekday(now);
  const clock = bucharestClock(now);
  const today: PlacedOffer[] = [];
  const later: PlacedOffer[] = [];
  for (const offer of offers) {
    const appliesToday =
      (!offer.daysOfWeek?.length || offer.daysOfWeek.includes(weekday)) &&
      (!offer.timeEnd || clock < offer.timeEnd) &&
      (!offer.pickupStart || sameBucharestDay(new Date(offer.pickupStart), now));
    (appliesToday ? today : later).push(offer);
  }
  return [...today, ...later];
}
