import { hotRank } from "./ranking";
import { UUID_RE } from "./uuid";
import type { DealStatus } from "./types";

export type FeedSort = "popular" | "latest";

export const DEFAULT_FEED_LIMIT = 30;
export const MAX_FEED_LIMIT = 50;
// Popular uses offset paging; this keeps a hand-crafted cursor from asking for a huge scan.
export const MAX_POPULAR_OFFSET = 1000;

// Must stay a string Postgres accepts as timestamptz (the cursor is bound as ::timestamptz).
const CURSOR_TIME_RE = /^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function isValidCursorTime(t: string): boolean {
  if (!CURSOR_TIME_RE.test(t)) return false;
  const ms = Date.parse(t);
  // Round trip rejects overflowing dates like Feb 30 that JS would roll over and PG would reject.
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 19) === t.slice(0, 19);
}

/** null once the next page would start beyond what decodeCursor accepts. */
export function nextPopularCursor(nextOffset: number): string | null {
  return nextOffset > MAX_POPULAR_OFFSET ? null : encodeCursor({ k: "popular", o: nextOffset });
}

export class InvalidCursorError extends Error {
  constructor() {
    super("invalid_cursor");
    this.name = "InvalidCursorError";
  }
}

export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_FEED_LIMIT;
  return Math.min(MAX_FEED_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Latest pages by keyset on (created_at, id): stable while new deals arrive. `t` is an ISO
 * timestamp that keeps Postgres' microsecond precision, so the SQL comparison is exact.
 *
 * Popular pages by offset: hot ranks shift as votes arrive, so there is no stable key to
 * resume from. A deal can occasionally repeat or be skipped across pages while votes land;
 * the client dedupes by id.
 */
export type FeedCursor = { k: "latest"; t: string; id: string } | { k: "popular"; o: number };

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string, sort: FeedSort): FeedCursor {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  if (typeof value !== "object" || value === null) throw new InvalidCursorError();
  const c = value as Record<string, unknown>;
  if (sort === "popular") {
    if (c.k !== "popular" || !Number.isInteger(c.o)) throw new InvalidCursorError();
    const o = c.o as number;
    if (o < 0 || o > MAX_POPULAR_OFFSET) throw new InvalidCursorError();
    return { k: "popular", o };
  }
  if (
    c.k !== "latest" ||
    typeof c.t !== "string" ||
    typeof c.id !== "string" ||
    !isValidCursorTime(c.t) ||
    !UUID_RE.test(c.id)
  ) {
    throw new InvalidCursorError();
  }
  return { k: "latest", t: c.t, id: c.id };
}

export type FeedCandidate = {
  id: string;
  status: DealStatus;
  score: number;
  createdAt: Date;
  validUntil: Date;
};

export type FeedParams = {
  sort: FeedSort;
  now: Date;
  hideThreshold: number;
  limit?: number;
  cursor?: string | null;
};

/** Mirrors the WHERE clause in feed-query.ts. */
export function isVisible(deal: FeedCandidate, now: Date, hideThreshold: number): boolean {
  return (
    deal.status === "published" &&
    deal.validUntil.getTime() > now.getTime() &&
    deal.score >= hideThreshold
  );
}

// Same tie-break as SQL: id compared as lowercase hex, which matches uuid byte order.
function byLatest(a: FeedCandidate, b: FeedCandidate): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

function byPopular(a: FeedCandidate, b: FeedCandidate): number {
  return (
    hotRank(b.score, b.createdAt) - hotRank(a.score, a.createdAt) || byLatest(a, b)
  );
}

/**
 * Pure mirror of queryFeed's semantics, for tests: same filter, same ordering, same cursors.
 */
export function selectFeed<T extends FeedCandidate>(
  deals: readonly T[],
  { sort, now, hideThreshold, limit, cursor }: FeedParams,
): { items: T[]; nextCursor: string | null } {
  const size = normalizeLimit(limit);
  const decoded = cursor ? decodeCursor(cursor, sort) : null;
  const sorted = deals
    .filter((deal) => isVisible(deal, now, hideThreshold))
    .sort(sort === "latest" ? byLatest : byPopular);

  let start = 0;
  let rest = sorted;
  if (decoded?.k === "popular") {
    start = decoded.o;
    rest = sorted.slice(start);
  } else if (decoded?.k === "latest") {
    const at = new Date(decoded.t).getTime();
    // (created_at, id) < (cursor.t, cursor.id)
    rest = sorted.filter(
      (d) => d.createdAt.getTime() < at || (d.createdAt.getTime() === at && d.id < decoded.id),
    );
  }

  const items = rest.slice(0, size);
  if (rest.length <= size) return { items, nextCursor: null };
  const last = items[items.length - 1]!;
  return {
    items,
    nextCursor:
      sort === "popular"
        ? nextPopularCursor(start + items.length)
        : encodeCursor({ k: "latest", t: last.createdAt.toISOString(), id: last.id }),
  };
}
