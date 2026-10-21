import postgres from "postgres";
import { venueMatchKey, type SourceId, type ValidScrapedOffer, type ScrapedVenue } from "@fentezfoamea/core";
import { env } from "./env.ts";

export type Sql = postgres.Sql;

export function connect(): Sql {
  return postgres(env.databaseUrl(), {
    max: 4,
    prepare: false,
    onnotice: () => {},
    connection: { search_path: "public, extensions" },
  });
}

export async function startRun(sql: Sql, source: SourceId): Promise<{ id: number; startedAt: Date }> {
  const [row] = await sql<{ id: number; started_at: Date }[]>`
    insert into scrape_runs (source) values (${source}) returning id, started_at
  `;
  if (!row) throw new Error("Could not create scrape run");
  return { id: row.id, startedAt: row.started_at };
}

export async function finishRun(
  sql: Sql,
  runId: number,
  result: { status: "ok" | "failed"; seen: number; rejected: number; error?: string },
): Promise<void> {
  await sql`
    update scrape_runs
    set finished_at = now(), status = ${result.status}, offers_seen = ${result.seen},
        offers_rejected = ${result.rejected}, error = ${result.error ?? null}
    where id = ${runId}
  `;
}

export async function upsertVenue(sql: Sql, source: SourceId, venue: ScrapedVenue): Promise<string> {
  const hasPoint = venue.lat !== undefined && venue.lon !== undefined;
  const [row] = await sql<{ id: string }[]>`
    insert into venues (source, source_venue_id, name, address, chain, url, match_key, location)
    values (
      ${source}, ${venue.sourceVenueId}, ${venue.name}, ${venue.address ?? null}, ${venue.chain ?? null},
      ${venue.url ?? null}, ${venueMatchKey(venue.name, venue.lat, venue.lon)},
      ${hasPoint ? sql`st_setsrid(st_makepoint(${venue.lon!}, ${venue.lat!}), 4326)::geography` : null}
    )
    on conflict (source, source_venue_id) do update set
      name = excluded.name,
      address = coalesce(excluded.address, venues.address),
      chain = coalesce(excluded.chain, venues.chain),
      url = coalesce(excluded.url, venues.url),
      match_key = excluded.match_key,
      location = coalesce(excluded.location, venues.location),
      last_seen_at = now()
    returning id
  `;
  if (!row) throw new Error(`Could not upsert venue ${venue.sourceVenueId}`);
  return row.id;
}

export async function upsertOffer(
  sql: Sql,
  source: SourceId,
  offer: ValidScrapedOffer,
  venueId: string | null,
): Promise<void> {
  await sql`
    insert into offers (
      source, source_offer_id, venue_id, kind, title, description, price_ron, original_price_ron,
      starts_at, ends_at, pickup_start, pickup_end, available_count, image_url, url, delivery_only, raw
    ) values (
      ${source}, ${offer.sourceOfferId}, ${venueId}, ${offer.kind}, ${offer.title}, ${offer.description ?? null},
      ${offer.priceRon ?? null}, ${offer.originalPriceRon ?? null}, ${offer.startsAt ?? null}, ${offer.endsAt ?? null},
      ${offer.pickupStart ?? null}, ${offer.pickupEnd ?? null}, ${offer.availableCount ?? null},
      ${offer.imageUrl ?? null}, ${offer.url}, ${offer.deliveryOnly}, ${offer.raw === undefined ? null : sql.json(offer.raw as postgres.JSONValue)}
    )
    on conflict (source, source_offer_id) do update set
      venue_id = excluded.venue_id,
      kind = excluded.kind,
      title = excluded.title,
      description = excluded.description,
      price_ron = excluded.price_ron,
      original_price_ron = excluded.original_price_ron,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      pickup_start = excluded.pickup_start,
      pickup_end = excluded.pickup_end,
      available_count = excluded.available_count,
      image_url = excluded.image_url,
      url = excluded.url,
      delivery_only = excluded.delivery_only,
      raw = excluded.raw,
      active = true,
      last_seen_at = now()
  `;
}

export async function deactivateUnseen(sql: Sql, source: SourceId, since: Date): Promise<number> {
  const result = await sql`
    update offers set active = false
    where source = ${source} and active and last_seen_at < ${since}
  `;
  return result.count;
}

export async function purgeOld(sql: Sql, olderThanDays = 30): Promise<void> {
  await sql`delete from offers where not active and last_seen_at < now() - make_interval(days => ${olderThanDays})`;
  await sql`delete from scrape_runs where started_at < now() - make_interval(days => ${olderThanDays})`;
}
