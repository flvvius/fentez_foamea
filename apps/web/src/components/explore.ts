import { distanceMeters, type LatLon, type OfferKind } from "@fentezfoamea/core";
import type { Offer } from "@/lib/offers";

export type SortKey = "distance" | "discount" | "price";

export type Filters = {
  kinds: OfferKind[];
  radiusKm: number | null;
  includeDelivery: boolean;
  sort: SortKey;
  venueId: string | null;
};

export type PlacedOffer = Offer & { distance: number | null; otherLocations?: number };

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
      distance: offer.lat !== null && offer.lon !== null ? distanceMeters(origin, { lat: offer.lat, lon: offer.lon }) : null,
    }));
}

export function applyFilters(offers: PlacedOffer[], filters: Omit<Filters, "venueId" | "sort">): PlacedOffer[] {
  return offers.filter((offer) => {
    if (filters.kinds.length && !filters.kinds.includes(offer.kind)) return false;
    if (!filters.includeDelivery && offer.deliveryOnly) return false;
    if (filters.radiusKm !== null && offer.distance !== null && offer.distance > filters.radiusKm * 1000) return false;
    return true;
  });
}

const comparators: Record<SortKey, (a: PlacedOffer, b: PlacedOffer) => number> = {
  distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
  discount: (a, b) => (b.discountPct ?? -1) - (a.discountPct ?? -1),
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
