import { z } from "zod";

export const OFFER_KINDS = [
  "surplus",
  "discount",
  "combo",
  "daily_menu",
  "happy_hour",
  "coupon",
] as const;

export type OfferKind = (typeof OFFER_KINDS)[number];

export const SOURCE_IDS = [
  "bonapp",
  "wolt",
  "bolt",
  "glovo",
  "chains",
  "daily",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

const isoDateTime = z.iso.datetime({ offset: true });

export const scrapedVenueSchema = z.object({
  sourceVenueId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  url: z.url().optional(),
  chain: z.string().optional(),
});

export type ScrapedVenue = z.infer<typeof scrapedVenueSchema>;

export const scrapedOfferSchema = z.object({
  sourceOfferId: z.string().min(1),
  kind: z.enum(OFFER_KINDS),
  title: z.string().min(1),
  description: z.string().optional(),
  priceRon: z.number().nonnegative().optional(),
  originalPriceRon: z.number().nonnegative().optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  pickupStart: isoDateTime.optional(),
  pickupEnd: isoDateTime.optional(),
  availableCount: z.number().int().nonnegative().optional(),
  imageUrl: z.url().optional(),
  url: z.url(),
  deliveryOnly: z.boolean().default(false),
  venue: scrapedVenueSchema.nullable(),
  raw: z.unknown().optional(),
});

export type ScrapedOffer = z.input<typeof scrapedOfferSchema>;
export type ValidScrapedOffer = z.output<typeof scrapedOfferSchema>;

export type OfferRow = {
  id: string;
  source: SourceId;
  kind: OfferKind;
  title: string;
  description: string | null;
  price_ron: number | null;
  original_price_ron: number | null;
  discount_pct: number | null;
  starts_at: string | null;
  ends_at: string | null;
  pickup_start: string | null;
  pickup_end: string | null;
  available_count: number | null;
  image_url: string | null;
  url: string;
  delivery_only: boolean;
  last_seen_at: string;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_chain: string | null;
  lat: number | null;
  lon: number | null;
  distance_m: number | null;
};
