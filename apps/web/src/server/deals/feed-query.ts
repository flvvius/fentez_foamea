import type postgres from "postgres";
import {
  decodeCursor,
  encodeCursor,
  nextPopularCursor,
  normalizeLimit,
  type FeedSort,
} from "./feed-select";
import { HOT_DECAY_SECONDS } from "./ranking";
import type { DealCard, DealChannel, DealType, FeedPage } from "./types";

type Row = {
  id: string;
  restaurant_name: string;
  title: string;
  description: string | null;
  deal_type: DealType;
  // numeric comes back as a string from postgres.js
  deal_price: string | null;
  regular_price: string | null;
  percent_off: number | null;
  currency: string;
  not_a_discount: boolean;
  days_of_week: number[] | null;
  time_start: string | null;
  time_end: string | null;
  valid_from: Date | null;
  valid_until: Date;
  channel: DealChannel;
  promo_code: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  source_url: string | null;
  image_id: string | null;
  score: number;
  created_at: Date;
  // created_at with microseconds, so the keyset cursor compares exactly
  created_at_cursor: string;
  submitter_name: string | null;
};

export type FeedQuery = {
  sort: FeedSort;
  limit?: number;
  cursor?: string | null;
  hideThreshold: number;
  now?: Date;
};

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null);
const num = (value: string | null) => (value === null ? null : Number(value));

function toCard(row: Row): DealCard {
  return {
    id: row.id,
    restaurantName: row.restaurant_name,
    title: row.title,
    description: row.description,
    dealType: row.deal_type,
    dealPrice: num(row.deal_price),
    regularPrice: num(row.regular_price),
    percentOff: row.percent_off,
    currency: row.currency,
    notADiscount: row.not_a_discount,
    daysOfWeek: row.days_of_week,
    timeStart: hhmm(row.time_start),
    timeEnd: hhmm(row.time_end),
    validFrom: row.valid_from?.toISOString() ?? null,
    validUntil: row.valid_until.toISOString(),
    channel: row.channel,
    promoCode: row.promo_code,
    address: row.address,
    lat: row.lat,
    lon: row.lon,
    sourceUrl: row.source_url,
    // Served by the deal-image endpoint (/api/deal-images/$id).
    imageUrl: row.image_id ? `/api/deal-images/${row.image_id}` : null,
    score: row.score,
    createdAt: row.created_at.toISOString(),
    submitterName: row.submitter_name,
  };
}

/**
 * The visibility filter and orderings here are mirrored by selectFeed() in feed-select.ts
 * (and hotRank() in ranking.ts): change them together.
 */
export async function queryFeed(sql: postgres.Sql, query: FeedQuery): Promise<FeedPage> {
  const { sort, hideThreshold } = query;
  const now = query.now ?? new Date();
  const limit = normalizeLimit(query.limit);
  const cursor = query.cursor ? decodeCursor(query.cursor, sort) : null;

  const keyset =
    cursor?.k === "latest"
      ? sql`and (d.created_at, d.id) < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`
      : sql``;
  const offset = cursor?.k === "popular" ? cursor.o : 0;

  const order =
    sort === "latest"
      ? sql`d.created_at desc, d.id desc`
      : sql`sign(d.score)::double precision
              * log(greatest(abs(d.score), 1)::double precision)
              + extract(epoch from d.created_at)::double precision / ${HOT_DECAY_SECONDS}::double precision desc,
            d.created_at desc, d.id desc`;

  // One extra row tells us whether another page exists.
  const rows = await sql<Row[]>`
    select d.id, d.restaurant_name, d.title, d.description, d.deal_type, d.deal_price,
           d.regular_price, d.percent_off, d.currency, d.not_a_discount, d.days_of_week,
           d.time_start::text as time_start, d.time_end::text as time_end,
           d.valid_from, d.valid_until, d.channel, d.promo_code, d.address,
           st_y(d.location::geometry) as lat, st_x(d.location::geometry) as lon,
           d.source_url, d.image_id, d.score, d.created_at,
           to_char(d.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor,
           u."name" as submitter_name
    from deals d
    left join auth_user u on u.id = d.submitted_by
    where d.status = 'published'
      and d.valid_until > ${now}
      and d.score >= ${hideThreshold}
      ${keyset}
    order by ${order}
    limit ${limit + 1} offset ${offset}
  `;

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last
      ? sort === "popular"
        ? nextPopularCursor(offset + page.length)
        : encodeCursor({ k: "latest", t: last.created_at_cursor, id: last.id })
      : null;

  return { deals: page.map(toCard), nextCursor };
}
