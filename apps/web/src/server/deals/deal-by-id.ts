import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import type { DealChannel, DealType } from "@fentezfoamea/core";
import { getSql } from "../db";
import { getDealsConfig } from "./config";
import { InvalidInputError } from "./inputs";
import { failInternally } from "./internal-error";
import type { DealCard } from "./types";
import { UUID_RE } from "./uuid";

// feed-query.ts does not export its row type, column list or toCard(), so this file mirrors
// them exactly. Keep the three in sync: columns, visibility (published, not expired, score at
// or above the hide threshold) and the row -> DealCard mapping.
type Row = {
  id: string;
  restaurant_name: string;
  title: string;
  description: string | null;
  deal_type: DealType;
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
  submitter_name: string | null;
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
    imageUrl: row.image_id ? `/api/deal-images/${row.image_id}` : null,
    score: row.score,
    createdAt: row.created_at.toISOString(),
    submitterName: row.submitter_name,
  };
}

/**
 * One public deal, or null when it doesn't exist or isn't visible in the feed (not published,
 * expired, or voted below the hide threshold). Public-cached like the feed.
 * Failures throw an Error whose message is "invalid_input" (400) or "internal_error" (500).
 */
export const fetchDealById = createServerFn({ method: "GET" })
  .validator((data: unknown): { id: string } => {
    const id = typeof data === "object" && data !== null ? (data as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      setResponseStatus(400);
      throw new InvalidInputError();
    }
    return { id: id.toLowerCase() };
  })
  .handler(async ({ data }): Promise<DealCard | null> => {
    try {
      const sql = getSql();
      const [row] = await sql<Row[]>`
        select d.id, d.restaurant_name, d.title, d.description, d.deal_type, d.deal_price,
               d.regular_price, d.percent_off, d.currency, d.not_a_discount, d.days_of_week,
               d.time_start::text as time_start, d.time_end::text as time_end,
               d.valid_from, d.valid_until, d.channel, d.promo_code, d.address,
               st_y(d.location::geometry) as lat, st_x(d.location::geometry) as lon,
               d.source_url, d.image_id, d.score, d.created_at,
               u."name" as submitter_name
        from deals d
        left join auth_user u on u.id = d.submitted_by
        where d.id = ${data.id}::uuid
          and d.status = 'published'
          and d.valid_until > ${new Date()}
          and d.score >= ${getDealsConfig().hideScore}
      `;
      setResponseHeaders(
        new Headers({
          "cache-control": "public, max-age=30",
          "cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        }),
      );
      return row ? toCard(row) : null;
    } catch (error) {
      return failInternally(error);
    }
  });
