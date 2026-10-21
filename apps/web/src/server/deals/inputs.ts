import type { FeedSort } from "./feed-select";
import type { VoteValue } from "./ranking";
import { UUID_RE } from "./uuid";

// Server fn inputs are validated by hand to avoid adding a dependency (zod) to apps/web.

export const MAX_MY_VOTES_IDS = 50;

export class InvalidInputError extends Error {
  constructor() {
    super("invalid_input");
    this.name = "InvalidInputError";
  }
}

function record(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new InvalidInputError();
  return data as Record<string, unknown>;
}

export type FeedInput = { sort: FeedSort; cursor?: string; limit?: number };

export function parseFeedInput(data: unknown): FeedInput {
  const { sort, cursor, limit } = record(data);
  if (sort !== "popular" && sort !== "latest") throw new InvalidInputError();
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 300)) {
    throw new InvalidInputError();
  }
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50)) {
    throw new InvalidInputError();
  }
  return { sort, cursor: cursor as string | undefined, limit: limit as number | undefined };
}

export type CastVoteInput = { dealId: string; value: VoteValue };

export function parseCastVoteInput(data: unknown): CastVoteInput {
  const { dealId, value } = record(data);
  if (typeof dealId !== "string" || !UUID_RE.test(dealId)) throw new InvalidInputError();
  if (value !== -1 && value !== 0 && value !== 1) throw new InvalidInputError();
  return { dealId: dealId.toLowerCase(), value };
}

export type MyVotesInput = { dealIds: string[] };

export function parseMyVotesInput(data: unknown): MyVotesInput {
  const { dealIds } = record(data);
  if (!Array.isArray(dealIds) || dealIds.length > MAX_MY_VOTES_IDS) throw new InvalidInputError();
  const ids = dealIds.map((id) => {
    if (typeof id !== "string" || !UUID_RE.test(id)) throw new InvalidInputError();
    return id.toLowerCase();
  });
  return { dealIds: ids };
}
