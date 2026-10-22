import { distanceMeters, type LatLon } from "@fentezfoamea/core";
import { bucharestWeekday, sameBucharestDay } from "@/lib/format";
import type { Offer } from "@/lib/offers";
import type { ExploreState, SortKey } from "@/lib/search";

export type PlacedOffer = Offer & { distance: number | null; headlinePct: number | null; otherLocations?: number };

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
  return offers
    .filter((offer) => isStillAvailable(offer, now))
    .map((offer) => ({
      ...offer,
      headlinePct: offer.discountPct ?? percentInTitle(offer.title),
      distance: offer.lat !== null && offer.lon !== null ? distanceMeters(origin, { lat: offer.lat, lon: offer.lon }) : null,
    }));
}

export function applyFilters(offers: PlacedOffer[], filters: Pick<ExploreState, "kinds" | "radiusKm" | "maxPrice" | "includeDelivery">): PlacedOffer[] {
  return offers.filter((offer) => {
    if (filters.kinds.length && !filters.kinds.includes(offer.kind)) return false;
    if (!filters.includeDelivery && offer.deliveryOnly) return false;
    if (filters.maxPrice !== null && (offer.price === null || offer.price > filters.maxPrice)) return false;
    if (filters.radiusKm !== null && !withinRadius(offer, filters.radiusKm)) return false;
    return true;
  });
}

function withinRadius(offer: PlacedOffer, radiusKm: number): boolean {
  if (offer.distance === null) return offer.venueId === null;
  return offer.distance <= radiusKm * 1000;
}

const POINTS_LOST_PER_KM = 8;
const UNKNOWN_DISTANCE_M = 5000;

const TITLE_PERCENT = /(?:^|[\s-−])(\d{1,2})\s*%/;

export function percentInTitle(title: string): number | null {
  const match = TITLE_PERCENT.exec(title);
  return match ? Number(match[1]) : null;
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
  price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
};

export function sortOffers(offers: PlacedOffer[], sort: SortKey): PlacedOffer[] {
  return [...offers].sort((a, b) => comparators[sort](a, b) || comparators.distance(a, b));
}

export function venuePins(offers: PlacedOffer[]): VenuePin[] {
  const pins = new Map<string, VenuePin>();
  for (const offer of offers) {
    if (!offer.venueId || offer.lat === null || offer.lon === null) continue;
    const pin = pins.get(offer.venueId) ?? {
      venueId: offer.venueId,
      name: offer.venueName ?? "",
      lat: offer.lat,
      lon: offer.lon,
      minPrice: null,
      bestDiscount: null,
      count: 0,
    };
    pin.count++;
    if (offer.price !== null && (pin.minPrice === null || offer.price < pin.minPrice)) pin.minPrice = offer.price;
    if (offer.discountPct !== null && (pin.bestDiscount === null || offer.discountPct > pin.bestDiscount)) pin.bestDiscount = offer.discountPct;
    pins.set(offer.venueId, pin);
  }
  return [...pins.values()];
}

export function collapseChainCopies(sorted: PlacedOffer[]): PlacedOffer[] {
  const firstByKey = new Map<string, PlacedOffer>();
  const result: PlacedOffer[] = [];
  for (const offer of sorted) {
    if (!offer.chain) {
      result.push(offer);
      continue;
    }
    const key = `${offer.source}|${offer.chain}|${offer.title}|${offer.price ?? ""}`;
    const first = firstByKey.get(key);
    if (first) {
      first.otherLocations = (first.otherLocations ?? 0) + 1;
      continue;
    }
    const copy = { ...offer, otherLocations: 0 };
    firstByKey.set(key, copy);
    result.push(copy);
  }
  return result;
}

export function validTodayFirst(offers: PlacedOffer[], now: Date): PlacedOffer[] {
  const weekday = bucharestWeekday(now);
  const appliesToday = (offer: PlacedOffer) =>
    (!offer.daysOfWeek?.length || offer.daysOfWeek.includes(weekday)) &&
    (!offer.pickupStart || sameBucharestDay(new Date(offer.pickupStart), now));
  return [...offers.filter(appliesToday), ...offers.filter((offer) => !appliesToday(offer))];
}
