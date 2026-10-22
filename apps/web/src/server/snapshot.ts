import type { OfferKind, SourceId } from "@fentezfoamea/core";
import { encodeSnapshot, type SnapshotWire } from "@/lib/offers";
import { getSql } from "./db";

type Row = {
  id: string;
  source: SourceId;
  kind: OfferKind;
  title: string;
  price_ron: number | null;
  original_price_ron: number | null;
  discount_pct: number | null;
  ends_at: Date | null;
  pickup_start: Date | null;
  pickup_end: Date | null;
  days_of_week: number[] | null;
  time_start: string | null;
  time_end: string | null;
  conditions: string | null;
  available_count: number | null;
  last_seen_at: Date;
  first_seen_at: Date;
  url: string;
  delivery_only: boolean;
  venue_id: string | null;
  venue_name: string | null;
  venue_chain: string | null;
  venue_url: string | null;
  lat: number | null;
  lon: number | null;
};

export async function loadOfferSnapshot(): Promise<SnapshotWire> {
  const sql = getSql();
  const [rows, runs] = await Promise.all([
    sql<Row[]>`
      select l.id, l.source, l.kind, l.title, l.price_ron, l.original_price_ron, l.discount_pct,
             l.ends_at, l.pickup_start, l.pickup_end, l.days_of_week, l.time_start, l.time_end, l.conditions, l.available_count, l.last_seen_at, l.first_seen_at,
             l.url, l.delivery_only, l.venue_id, l.venue_name, l.venue_chain, v.url as venue_url, l.lat, l.lon
      from live_offers l
      left join venues v on v.id = l.venue_id
      order by l.discount_pct desc nulls last
      limit 8000
    `,
    sql<{ finished_at: Date | null }[]>`
      select max(finished_at) as finished_at from scrape_runs where status = 'ok'
    `,
  ]);

  return encodeSnapshot({
    generatedAt: new Date().toISOString(),
    updatedAt: runs[0]?.finished_at?.toISOString() ?? null,
    offers: rows.map((row) => ({
      id: row.id,
      source: row.source,
      kind: row.kind,
      title: row.title,
      price: row.price_ron,
      originalPrice: row.original_price_ron,
      discountPct: row.discount_pct,
      endsAt: row.ends_at?.toISOString() ?? null,
      pickupStart: row.pickup_start?.toISOString() ?? null,
      pickupEnd: row.pickup_end?.toISOString() ?? null,
      daysOfWeek: row.days_of_week,
      timeStart: row.time_start,
      timeEnd: row.time_end,
      conditions: row.conditions,
      available: row.available_count,
      checkedAt: row.kind === "surplus" ? row.last_seen_at.toISOString() : null,
      firstSeenAt: row.kind === "surplus" ? row.first_seen_at.toISOString() : null,
      url: row.url,
      deliveryOnly: row.delivery_only,
      venueId: row.venue_id,
      venueName: row.venue_name,
      chain: row.venue_chain,
      lat: row.lat,
      lon: row.lon,
      venueUrl: row.venue_url,
    })),
  });
}
