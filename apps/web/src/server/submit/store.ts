import type postgres from "postgres";
import { consumeRateLimit } from "../deals/rate-limit";
import { SubmitError } from "./errors";
import { getDealsConfig } from "../deals/config";
import { consumeExtractBudget, consumeExtractLimits, consumeUserExtractLimit } from "./extract-limits";
import type { StoredImage } from "./extract-image";
import type { ImageMime } from "./image-type";
import { SUBMIT_ACTION, type NewDealRow, type SubmitDealDeps, type SubmitTx } from "./submit-deal";
import type { DuplicateResult } from "./types";
import { UPLOAD_ACTION, UPLOAD_PER_DAY, type UploadImageDeps, type UploadTx } from "./upload-image";

// Pass a transaction where one is running: the pool has a single connection, so querying the
// plain `sql` from inside sql.begin would wait on itself forever.
type Queryable = postgres.Sql | postgres.TransactionSql;

/**
 * The deal that blocks a new post of this source, if any: one that is live, or one a moderator
 * hid (so hidden spam cannot be reposted at once). A deal that is only below the score
 * threshold does not block, so a corrected repost is possible. Extract and submit both ask
 * through this function, so they cannot disagree. Expiry is bounded (see latestValidUntil),
 * so a deal cannot hold a url for long.
 */
export async function findDuplicateDeal(
  q: Queryable,
  normalizedUrl: string,
  now: Date,
  hideScore: number,
): Promise<DuplicateResult | null> {
  const [row] = await q<{ id: string; title: string; status: string }[]>`
    select id, title, status from deals
    where source_url_normalized = ${normalizedUrl}
      and valid_until > ${now}
      and ((status = 'published' and score >= ${hideScore}) or status = 'hidden')
    order by (status = 'published') desc, created_at asc limit 1
  `;
  if (!row) return null;
  // A hidden deal still blocks the source, but its id and title aren't public.
  if (row.status === "hidden") throw SubmitError.of("source_blocked");
  return { status: "duplicate", dealId: row.id, title: row.title };
}

export type ImageMeta = { mimeType: ImageMime; sha256: string };

/** An image's type and hash, only while a deal the feed shows uses it (published, live, above the hide score). */
export async function findVisibleImage(
  q: Queryable,
  imageId: string,
  now: Date,
  hideScore: number,
): Promise<ImageMeta | null> {
  const [row] = await q<{ mime_type: ImageMime; sha256: string }[]>`
    select i.mime_type, i.sha256 from deal_images i
    where i.id = ${imageId}
      and exists (
        select 1 from deals d
        where d.image_id = i.id and d.status = 'published'
          and d.valid_until > ${now} and d.score >= ${hideScore}
      )
  `;
  return row ? { mimeType: row.mime_type, sha256: row.sha256 } : null;
}

export async function loadImageBytes(q: Queryable, imageId: string): Promise<Uint8Array | null> {
  const [row] = await q<{ bytes: Uint8Array }[]>`select bytes from deal_images where id = ${imageId}`;
  return row?.bytes ?? null;
}

export async function findOwnedImage(q: Queryable, imageId: string, userId: string): Promise<StoredImage | null> {
  const [row] = await q<{ mime_type: ImageMime; bytes: Uint8Array }[]>`
    select mime_type, bytes from deal_images where id = ${imageId} and uploaded_by = ${userId}
  `;
  return row ? { mimeType: row.mime_type, bytes: row.bytes } : null;
}

/** Per-user limit and global budget in one transaction (see consumeExtractLimits). */
export function runExtractLimits(sql: postgres.Sql, userId: string): Promise<void> {
  const config = getDealsConfig();
  return sql.begin((tx) => consumeExtractLimits((options) => consumeRateLimit(tx, options), userId, config));
}

export function runUserExtractLimit(sql: postgres.Sql, userId: string): Promise<void> {
  const config = getDealsConfig();
  return sql.begin((tx) => consumeUserExtractLimit((options) => consumeRateLimit(tx, options), userId, config));
}

export function runExtractBudget(sql: postgres.Sql): Promise<void> {
  const config = getDealsConfig();
  return sql.begin((tx) => consumeExtractBudget((options) => consumeRateLimit(tx, options), config));
}

export function pgSubmitDeps(sql: postgres.Sql, userId: string): SubmitDealDeps {
  return {
    now: () => new Date(),
    imageOwnedBy: async (imageId, ownerId) => {
      const [row] = await sql<{ id: string }[]>`
        select id from deal_images where id = ${imageId} and uploaded_by = ${ownerId}
      `;
      return row !== undefined;
    },
    transaction: <T>(run: (tx: SubmitTx) => Promise<T>) =>
      sql.begin((tx) =>
        run({
          lockSource: async (normalizedUrl) => {
            await tx`select pg_advisory_xact_lock(hashtext('deal_source'), hashtext(${normalizedUrl}))`;
          },
          findDuplicate: (normalizedUrl, now) => findDuplicateDeal(tx, normalizedUrl, now, getDealsConfig().hideScore),
          rateLimit: () =>
            consumeRateLimit(tx, {
              userId,
              action: SUBMIT_ACTION,
              limit: getDealsConfig().submitPerDay,
              windowSeconds: 86_400,
            }),
          insertDeal: (row) => insertDeal(tx, row),
        }),
      ) as Promise<T>,
  };
}

export async function insertDeal(tx: postgres.TransactionSql, row: NewDealRow): Promise<string> {
  const location =
    row.lat !== null && row.lon !== null
      ? tx`st_setsrid(st_makepoint(${row.lon}, ${row.lat}), 4326)::geography`
      : tx`null`;
  const [inserted] = await tx<{ id: string }[]>`
    insert into deals (
      source_type, status, restaurant_name, title, description, deal_type,
      deal_price, regular_price, percent_off, currency, not_a_discount,
      days_of_week, time_start, time_end, valid_from, valid_until, channel,
      promo_code, address, location, source_url, source_url_normalized, image_id,
      evidence_snippet, llm_confidence, extraction_source, submitted_by
    ) values (
      ${row.sourceType}, ${row.status}, ${row.restaurantName}, ${row.title}, ${row.description}, ${row.dealType},
      ${row.dealPrice}, ${row.regularPrice}, ${row.percentOff}, ${row.currency}, ${row.notADiscount},
      ${row.daysOfWeek === null ? null : tx.array(row.daysOfWeek)}::smallint[],
      ${row.timeStart}::time, ${row.timeEnd}::time, ${row.validFrom}::timestamptz, ${row.validUntil}::timestamptz,
      ${row.channel}, ${row.promoCode}, ${row.address}, ${location}, ${row.sourceUrl}, ${row.sourceUrlNormalized},
      ${row.imageId}, ${row.evidenceSnippet}, ${row.llmConfidence}, ${row.extractionSource}, ${row.submittedBy}
    )
    returning id
  `;
  return inserted!.id;
}

export function pgUploadDeps(sql: postgres.Sql, userId: string): UploadImageDeps {
  return {
    findExisting: async (ownerId, sha256) => {
      const [row] = await sql<{ id: string }[]>`
        select id from deal_images where uploaded_by = ${ownerId} and sha256 = ${sha256}
        order by created_at asc limit 1
      `;
      return row?.id ?? null;
    },
    transaction: <T>(run: (tx: UploadTx) => Promise<T>) =>
      sql.begin((tx) =>
        run({
          rateLimit: () =>
            consumeRateLimit(tx, { userId, action: UPLOAD_ACTION, limit: UPLOAD_PER_DAY, windowSeconds: 86_400 }),
          insertImage: async ({ userId: ownerId, mimeType, bytes, sha256 }) => {
            const [row] = await tx<{ id: string }[]>`
              insert into deal_images (uploaded_by, mime_type, bytes, byte_size, sha256)
              values (${ownerId}, ${mimeType}, ${bytes as Buffer}, ${bytes.byteLength}, ${sha256})
              returning id
            `;
            return row!.id;
          },
        }),
      ) as Promise<T>,
  };
}
