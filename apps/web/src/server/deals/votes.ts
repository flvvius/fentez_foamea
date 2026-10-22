import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { getSql } from "../db";
import { getCurrentUser } from "../session";
import { failInternally } from "./internal-error";
import { parseCastVoteInput, parseMyVotesInput } from "./inputs";
import type { VoteValue } from "./ranking";
import { VoteError } from "./vote-errors";
import { runCastVote, type VoteResult } from "./vote-store";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Sets, changes (value = 1 / -1) or removes (value = 0) the current user's vote.
 * Failures throw a VoteError whose message is the code (see vote-errors.ts; use
 * voteErrorCode() and voteRetryAfter() on the caught error): unauthorized 401,
 * invalid_input 400, deal_not_found 404, deal_not_votable 409, rate_limited:<seconds> 429,
 * internal_error 500.
 */
export const castVote = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    try {
      return parseCastVoteInput(data);
    } catch (error) {
      setResponseStatus(400);
      throw error;
    }
  })
  .handler(async ({ data }): Promise<VoteResult> => {
    setResponseHeaders(new Headers(NO_STORE));
    try {
      const user = await getCurrentUser();
      const outcome = await runCastVote(getSql(), user?.id ?? null, data.dealId, data.value);
      if (outcome.kind === "ok") return outcome.result;
      const { error } = outcome;
      setResponseStatus(error.status);
      if (error.retryAfterSeconds !== null) {
        setResponseHeaders(
          new Headers({ ...NO_STORE, "retry-after": String(error.retryAfterSeconds) }),
        );
      }
      throw error;
    } catch (error) {
      if (error instanceof VoteError) throw error;
      return failInternally(error);
    }
  });

/** The current user's votes on the given deals: dealId -> -1 | 1. Empty when signed out. */
export const fetchMyVotes = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    try {
      return parseMyVotesInput(data);
    } catch (error) {
      setResponseStatus(400);
      throw error;
    }
  })
  .handler(async ({ data }): Promise<Record<string, Exclude<VoteValue, 0>>> => {
    setResponseHeaders(new Headers({ "cache-control": "private, no-store" }));
    try {
      const user = await getCurrentUser();
      if (!user || data.dealIds.length === 0) return {};
      const sql = getSql();
      const rows = await sql<{ deal_id: string; value: -1 | 1 }[]>`
        select deal_id, value from deal_votes
        where user_id = ${user.id} and deal_id = any(${sql.array(data.dealIds)}::uuid[])
      `;
      return Object.fromEntries(rows.map((row) => [row.deal_id, row.value]));
    } catch (error) {
      return failInternally(error);
    }
  });
