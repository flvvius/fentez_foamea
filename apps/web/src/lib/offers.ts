import type { OfferKind, SourceId } from "@fentezfoamea/core";

export type Offer = {
  id: string;
  source: SourceId;
  kind: OfferKind;
  title: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  endsAt: string | null;
  pickupStart: string | null;
  pickupEnd: string | null;
  daysOfWeek: number[] | null;
  timeStart: string | null;
  timeEnd: string | null;
  conditions: string | null;
  available: number | null;
  imageUrl: string | null;
  url: string;
  deliveryOnly: boolean;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  chain: string | null;
  lat: number | null;
  lon: number | null;
};

export type OfferSnapshot = { offers: Offer[]; updatedAt: string | null; generatedAt: string };
