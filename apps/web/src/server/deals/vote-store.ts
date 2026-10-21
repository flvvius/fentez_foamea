import type postgres from "postgres";
import { consumeRateLimit, type RateLimitResult } from "./rate-limit";
import { voteDelta, type VoteValue } from "./ranking";
import type { DealStatus } from "./types";
import { VoteError } from "./vote-errors";

export const VOTE_RATE_LIMIT = { action: "vote", limit: 60, windowSeconds: 60 } as const;

export type LockedDeal = { status: DealStatus; validUntil: Date; score: number };

/** The few storage operations a vote needs, so the logic can be tested without a database. */
export interface VoteStore {
  /** Locks the deal row until the surrounding transaction ends; null if it doesn't exist. */
  lockDeal(dealId: string): Promise<LockedDeal | null>;
  getVote(dealId: string, userId: string): Promise<VoteValue>;
  setVote(dealId: string, userId: string, value: -1 | 1): Promise<void>;
  deleteVote(dealId: string, userId: string): Promise<void>;
  /** Returns the new score. */
  addScore(dealId: string, delta: number): Promise<number>;
}

export type VoteResult = { dealId: string; score: number; myVote: VoteValue };

/**
 * Must run inside one transaction. Locking the deal row serializes concurrent votes on the
 * same deal, so the denormalized score cannot drift from deal_votes.
 */
export async function applyVote(
  store: VoteStore,
  userId: string | null,
  dealId: string,
  value: VoteValue,
  now: Date,
): Promise<VoteResult> {
  if (!userId) throw new VoteError("unauthorized");

  const deal = await store.lockDeal(dealId);
  if (!deal) throw new VoteError("deal_not_found");
  // Below-threshold deals stay votable so they can recover; expired or unpublished ones don't.
  if (deal.status !== "published" || deal.validUntil.getTime() <= now.getTime()) {
    throw new VoteError("deal_not_votable");
  }

  const prev = await store.getVote(dealId, userId);
  const delta = voteDelta(prev, value);
  if (delta === 0) return { dealId, score: deal.score, myVote: value };

  if (value === 0) await store.deleteVote(dealId, userId);
  else await store.setVote(dealId, userId, value);
  const score = await store.addScore(dealId, delta);
  return { dealId, score, myVote: value };
}

export function pgVoteStore(tx: postgres.TransactionSql): VoteStore {
  return {
    async lockDeal(dealId) {
      const [row] = await tx<{ status: DealStatus; valid_until: Date; score: number }[]>`
        select status, valid_until, score from deals where id = ${dealId} for update
      `;
      return row ? { status: row.status, validUntil: row.valid_until, score: row.score } : null;
    },
    async getVote(dealId, userId) {
      const [row] = await tx<{ value: -1 | 1 }[]>`
        select value from deal_votes where deal_id = ${dealId} and user_id = ${userId}
      `;
      return row?.value ?? 0;
    },
    async setVote(dealId, userId, value) {
      await tx`
        insert into deal_votes (deal_id, user_id, value) values (${dealId}, ${userId}, ${value})
        on conflict (deal_id, user_id) do update set value = excluded.value, updated_at = now()
      `;
    },
    async deleteVote(dealId, userId) {
      await tx`delete from deal_votes where deal_id = ${dealId} and user_id = ${userId}`;
    },
    async addScore(dealId, delta) {
      const [row] = await tx<{ score: number }[]>`
        update deals set score = score + ${delta}, updated_at = now()
        where id = ${dealId} returning score
      `;
      return row!.score;
    },
  };
}

export type CastVoteOutcome =
  | { kind: "ok"; result: VoteResult }
  | { kind: "error"; error: VoteError };

export type CastVoteDeps = {
  /** Checks the limit and records the call when allowed. */
  rateLimit: () => Promise<RateLimitResult>;
  store: VoteStore;
};

/**
 * Rate-limit check, then the vote. Expected failures are returned, not thrown, so the caller
 * can commit the transaction: a failed vote still counts toward the limit, and a
 * rate-limited call touches no votes or score.
 */
export async function castVoteFlow(
  { rateLimit, store }: CastVoteDeps,
  userId: string | null,
  dealId: string,
  value: VoteValue,
  now: Date,
): Promise<CastVoteOutcome> {
  if (!userId) return { kind: "error", error: new VoteError("unauthorized") };
  const limit = await rateLimit();
  if (!limit.allowed) {
    return { kind: "error", error: new VoteError("rate_limited", limit.retryAfterSeconds) };
  }
  try {
    return { kind: "ok", result: await applyVote(store, userId, dealId, value, now) };
  } catch (error) {
    if (error instanceof VoteError) return { kind: "error", error };
    throw error;
  }
}

/** The Postgres wiring: everything runs in one transaction. */
export function runCastVote(
  sql: postgres.Sql,
  userId: string | null,
  dealId: string,
  value: VoteValue,
  now: Date = new Date(),
): Promise<CastVoteOutcome> {
  return sql.begin((tx) =>
    castVoteFlow(
      {
        rateLimit: () => consumeRateLimit(tx, { userId, ...VOTE_RATE_LIMIT }),
        store: pgVoteStore(tx),
      },
      userId,
      dealId,
      value,
      now,
    ),
  );
}
