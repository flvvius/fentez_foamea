import { cacheLife } from "next/cache";
import type { OfferKind, SourceId } from "@fentezfoamea/core";
import { getSql } from "./db";

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

export type OfferSnapshot = { offers: Offer[]; updatedAt: string | null };

type Row = {
  id: string;
  source: SourceId;
  kind: OfferKind;
  title: string;
  description: string | null;
  price_ron: number | null;
  original_price_ron: number | null;
  discount_pct: number | null;
  ends_at: Date | null;
  pickup_start: Date | null;
  pickup_end: Date | null;
  available_count: number | null;
  image_url: string | null;
  url: string;
  delivery_only: boolean;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_chain: string | null;
  lat: number | null;
  lon: number | null;
};

export async function getOfferSnapshot(): Promise<OfferSnapshot> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300, expire: 3600 });

  const sql = getSql();
  const [rows, runs] = await Promise.all([
    sql<Row[]>`
      select id, source, kind, title, description, price_ron, original_price_ron, discount_pct,
             ends_at, pickup_start, pickup_end, available_count, image_url, url, delivery_only,
             venue_id, venue_name, venue_address, venue_chain, lat, lon
      from live_offers
      order by discount_pct desc nulls last
      limit 8000
    `,
    sql<{ finished_at: Date | null }[]>`
      select max(finished_at) as finished_at from scrape_runs where status = 'ok'
    `,
  ]);

  return {
    updatedAt: runs[0]?.finished_at?.toISOString() ?? null,
    offers: rows.map((row) => ({
      id: row.id,
      source: row.source,
      kind: row.kind,
      title: row.title,
      description: row.description,
      price: row.price_ron,
      originalPrice: row.original_price_ron,
      discountPct: row.discount_pct,
      endsAt: row.ends_at?.toISOString() ?? null,
      pickupStart: row.pickup_start?.toISOString() ?? null,
      pickupEnd: row.pickup_end?.toISOString() ?? null,
      available: row.available_count,
      imageUrl: row.image_url,
      url: row.url,
      deliveryOnly: row.delivery_only,
      venueId: row.venue_id,
      venueName: row.venue_name,
      venueAddress: row.venue_address,
      chain: row.venue_chain,
      lat: row.lat,
      lon: row.lon,
    })),
  };
}
