import type postgres from "postgres";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export type RateLimitOptions = {
  /** null = a global row shared by everyone (e.g. the daily extraction budget). */
  userId: string | null;
  action: string;
  limit: number;
  windowSeconds: number;
};

const PRUNE_BATCH = 100;
const MIN_RETENTION_SECONDS = 86_400;

/**
 * Sliding window: allowed while fewer than `limit` events fall in the window.
 *
 * `blockingEvent` is the (count - limit + 1)-th oldest event in the window: that many events
 * must age out before a new one fits, and the last of them to leave is that event. Only
 * needed (and only fetched) when denied.
 */
export function decideRateLimit(
  countInWindow: number,
  limit: number,
  blockingEvent: Date | null,
  now: Date,
  windowSeconds: number,
): RateLimitResult {
  if (countInWindow < limit) return { allowed: true, retryAfterSeconds: 0 };
  const from = blockingEvent ?? now;
  const wait = Math.ceil((from.getTime() + windowSeconds * 1000 - now.getTime()) / 1000);
  return { allowed: false, retryAfterSeconds: Math.max(1, wait) };
}

/**
 * Checks the limit and, when allowed, records an event. Pass a transaction: the advisory
 * lock is transaction-scoped, and it is what makes check + insert atomic per (action, user),
 * so concurrent calls cannot both squeeze under the limit. A denied call records nothing.
 */
export async function consumeRateLimit(
  tx: postgres.TransactionSql,
  { userId, action, limit, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  await tx`select pg_advisory_xact_lock(
    hashtext('rate_limit'),
    hashtext(${action} || ':' || coalesce(${userId}::text, 'global'))
  )`;

  // The database clock decides "now", read once: clock_timestamp() is volatile, so using it
  // inside the WHERE would stop created_at from being an index condition.
  const [{ now }] = await tx<{ now: Date }[]>`select clock_timestamp() as now`;
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);
  const bucket = userId === null ? tx`user_id is null` : tx`user_id = ${userId}`;

  const [{ n }] = await tx<{ n: number }[]>`
    select count(*)::int as n from rate_limit_events
    where action = ${action} and ${bucket} and created_at > ${windowStart}
  `;

  let blockingEvent: Date | null = null;
  if (n >= limit) {
    const [row] = await tx<{ created_at: Date }[]>`
      select created_at from rate_limit_events
      where action = ${action} and ${bucket} and created_at > ${windowStart}
      order by created_at asc
      offset ${n - limit} limit 1
    `;
    blockingEvent = row?.created_at ?? null;
  }

  const decision = decideRateLimit(n, limit, blockingEvent, now, windowSeconds);
  if (decision.allowed) {
    await tx`insert into rate_limit_events (user_id, action, created_at)
             values (${userId}, ${action}, ${now})`;
  }

  // Opportunistic pruning keeps the table bounded without a cleanup job.
  const cutoff = new Date(now.getTime() - Math.max(windowSeconds, MIN_RETENTION_SECONDS) * 1000);
  await tx`
    delete from rate_limit_events where id in (
      select id from rate_limit_events
      where action = ${action} and ${bucket} and created_at < ${cutoff}
      limit ${PRUNE_BATCH}
    )
  `;
  return decision;
}
