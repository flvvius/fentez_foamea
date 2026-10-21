import type { ScrapedOffer, ScrapedVenue } from "@fentezfoamea/core";

export type ChainDeal = Omit<ScrapedOffer, "sourceOfferId" | "venue"> & { dealId: string };

export function offersPerStore(deal: ChainDeal, stores: ScrapedVenue[]): ScrapedOffer[] {
  const { dealId, ...offer } = deal;
  return stores.map((store) => ({ ...offer, sourceOfferId: `${dealId}@${store.sourceVenueId}`, venue: store }));
}

export function nationalOffer(deal: ChainDeal): ScrapedOffer {
  const { dealId, ...offer } = deal;
  return { ...offer, sourceOfferId: dealId, venue: null };
}

export function joinConditions(parts: (string | undefined)[]): string | undefined {
  const unique = [...new Set(parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)))];
  return unique.length ? unique.join("; ").slice(0, 300) : undefined;
}

export function withBucharest(address: string): string {
  return /bucure[sșş]ti|bucharest/i.test(address) ? address : `${address}, București`;
}
