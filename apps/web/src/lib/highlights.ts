import { BUCHAREST_CENTER, type OfferKind } from "@fentezfoamea/core";
import { applyFilters, collapseChainCopies, placeOffers, sortOffers, validTodayFirst, type PlacedOffer } from "@/components/explore";
import { bucharestClock, bucharestWeekday, sameBucharestDay } from "@/lib/format";
import { LANDINGS } from "@/lib/landing";
import type { Offer } from "@/lib/offers";

export type Highlight = Pick<
  Offer,
  "id" | "kind" | "title" | "price" | "originalPrice" | "discountPct" | "pickupStart" | "pickupEnd" | "timeStart" | "timeEnd" | "available" | "venueId" | "venueName" | "chain"
> & { isNew: boolean };

export type KindCount = { slug: string; kind: OfferKind; label: string; count: number };

export type BudgetCount = { maxPrice: number; count: number };

export type Highlights = { picks: Highlight[]; total: number; kinds: KindCount[]; budgets: BudgetCount[] };

const HOME_BUDGETS = [15, 25] as const;

const PICKS = 5;
const MAX_PICK_PRICE = 60;
const FILLER_KINDS: OfferKind[] = ["combo", "daily_menu"];

export function pickHighlights(offers: Offer[], now: Date, limit = PICKS): Highlights {
  const placed = placeOffers(offers, BUCHAREST_CENTER, now);
  const today = placed.filter((offer) => runsToday(offer, now));
  const affordable = today.filter((offer) => !offer.deliveryOnly && offer.price !== null && offer.price <= MAX_PICK_PRICE && offer.available !== 0);
  const bargains = sortOffers(affordable.filter(hasSaving), "best");
  const fillers = sortOffers(affordable.filter((offer) => !hasSaving(offer) && FILLER_KINDS.includes(offer.kind)), "price");
  const picks = onePerBrand(collapseChainCopies([...bargains, ...fillers])).slice(0, limit);
  const distinctToday = collapseChainCopies(today);
  return {
    picks: picks.map((offer) => toHighlight(offer, now)),
    total: collapseChainCopies(validTodayFirst(placed, now)).length,
    kinds: LANDINGS.map((landing) => ({
      slug: landing.slug,
      kind: landing.kind,
      label: landing.nearName,
      count: distinctToday.filter((offer) => offer.kind === landing.kind).length,
    })).filter((entry) => entry.count > 0),
    budgets: HOME_BUDGETS.map((maxPrice) => ({
      maxPrice,
      count: collapseChainCopies(applyFilters(placed, { kinds: [], radiusKm: null, maxPrice, includeDelivery: false })).length,
    })).filter((entry) => entry.count > 0),
  };
}

function onePerBrand(offers: PlacedOffer[]): PlacedOffer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const brand = brandKey(offer);
    if (seen.has(brand)) return false;
    seen.add(brand);
    return true;
  });
}

function brandKey(offer: PlacedOffer): string {
  const name = offer.chain ?? offer.venueName ?? offer.id;
  const words = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().match(/[a-z0-9]+/g) ?? [name];
  return words.slice(0, 2).join(" ");
}

export type SavedPicks = { picks: Highlight[]; total: number };

export function pickSaved(offers: Offer[], savedIds: readonly string[], now: Date, limit = PICKS): SavedPicks {
  const wanted = new Set(savedIds);
  const atSaved = placeOffers(offers, BUCHAREST_CENTER, now).filter(
    (offer) => (offer.placeId !== null && wanted.has(offer.placeId)) || (offer.venueId !== null && wanted.has(offer.venueId)),
  );
  const today = collapseChainCopies(sortOffers(atSaved.filter((offer) => runsToday(offer, now) && offer.available !== 0), "best"));
  return { picks: today.slice(0, limit).map((offer) => toHighlight(offer, now)), total: today.length };
}

function runsToday(offer: PlacedOffer, now: Date): boolean {
  if (offer.daysOfWeek?.length && !offer.daysOfWeek.includes(bucharestWeekday(now))) return false;
  if (offer.timeEnd && bucharestClock(now) >= offer.timeEnd) return false;
  return !offer.pickupStart || sameBucharestDay(new Date(offer.pickupStart), now);
}

function hasSaving(offer: PlacedOffer): boolean {
  return offer.kind === "surplus" || offer.headlinePct !== null || (offer.originalPrice ?? 0) > (offer.price ?? 0);
}

const NEW_FOR_MS = 3 * 60 * 60 * 1000;

function toHighlight(offer: PlacedOffer, now: Date): Highlight {
  return {
    id: offer.id,
    kind: offer.kind,
    title: offer.title,
    price: offer.price,
    originalPrice: offer.originalPrice,
    discountPct: offer.discountPct,
    pickupStart: offer.pickupStart,
    pickupEnd: offer.pickupEnd,
    timeStart: offer.timeStart,
    timeEnd: offer.timeEnd,
    available: offer.available,
    venueId: offer.venueId,
    isNew: offer.firstSeenAt !== null && now.getTime() - new Date(offer.firstSeenAt).getTime() < NEW_FOR_MS,
    venueName: offer.venueName,
    chain: offer.chain,
  };
}
