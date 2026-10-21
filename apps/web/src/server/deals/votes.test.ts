import { beforeEach, describe, expect, it } from "vitest";
import { MemoryVoteStore } from "./memory-vote-store";
import { VoteError, voteErrorCode, voteRetryAfter } from "./vote-errors";
import type { RateLimitResult } from "./rate-limit";
import { applyVote, castVoteFlow } from "./vote-store";

const now = new Date("2026-10-22T12:00:00Z");
const future = new Date("2026-10-30T00:00:00Z");
const DEAL = "11111111-1111-4111-8111-111111111111";

let store: MemoryVoteStore;
beforeEach(() => {
  store = new MemoryVoteStore();
  store.deals.set(DEAL, { status: "published", validUntil: future, score: 0 });
});

describe("applyVote", () => {
  it("upvotes", async () => {
    expect(await applyVote(store, "u1", DEAL, 1, now)).toEqual({ dealId: DEAL, score: 1, myVote: 1 });
  });

  it("downvotes", async () => {
    expect(await applyVote(store, "u1", DEAL, -1, now)).toEqual({ dealId: DEAL, score: -1, myVote: -1 });
  });

  it("changing up to down moves the score by 2", async () => {
    await applyVote(store, "u1", DEAL, 1, now);
    const result = await applyVote(store, "u1", DEAL, -1, now);
    expect(result).toEqual({ dealId: DEAL, score: -1, myVote: -1 });
    expect(store.votes.get(`${DEAL}:u1`)).toBe(-1);
  });

  it("removing a vote restores the score", async () => {
    await applyVote(store, "u1", DEAL, 1, now);
    const result = await applyVote(store, "u1", DEAL, 0, now);
    expect(result).toEqual({ dealId: DEAL, score: 0, myVote: 0 });
    expect(store.votes.size).toBe(0);
  });

  it("repeating the same vote is a no-op", async () => {
    await applyVote(store, "u1", DEAL, 1, now);
    const result = await applyVote(store, "u1", DEAL, 1, now);
    expect(result.score).toBe(1);
    expect(store.votes.size).toBe(1);
  });

  it("removing a vote that doesn't exist is a no-op", async () => {
    expect((await applyVote(store, "u1", DEAL, 0, now)).score).toBe(0);
  });

  it("counts each user once", async () => {
    await applyVote(store, "u1", DEAL, 1, now);
    const result = await applyVote(store, "u2", DEAL, 1, now);
    expect(result.score).toBe(2);
  });

  it("keeps votable a deal that is below the hide threshold", async () => {
    store.deals.get(DEAL)!.score = -9;
    expect((await applyVote(store, "u1", DEAL, 1, now)).score).toBe(-8);
  });

  it("rejects a missing deal", async () => {
    const error = await applyVote(store, "u1", "22222222-2222-4222-8222-222222222222", 1, now).catch((e) => e);
    expect(voteErrorCode(error)).toBe("deal_not_found");
  });

  it.each(["pending", "hidden", "expired"] as const)("rejects a %s deal", async (status) => {
    store.deals.get(DEAL)!.status = status;
    const error = await applyVote(store, "u1", DEAL, 1, now).catch((e) => e);
    expect(voteErrorCode(error)).toBe("deal_not_votable");
    expect(store.votes.size).toBe(0);
  });

  it("rejects an expired deal, including exactly at valid_until", async () => {
    store.deals.get(DEAL)!.validUntil = now;
    const error = await applyVote(store, "u1", DEAL, 1, now).catch((e) => e);
    expect(voteErrorCode(error)).toBe("deal_not_votable");
  });

  it("rejects a signed-out user", async () => {
    const error = await applyVote(store, null, DEAL, 1, now).catch((e) => e);
    expect(voteErrorCode(error)).toBe("unauthorized");
    expect(store.deals.get(DEAL)!.score).toBe(0);
  });
});

describe("castVoteFlow", () => {
  const allow: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };
  const deny: RateLimitResult = { allowed: false, retryAfterSeconds: 42 };

  function setup(limit: RateLimitResult) {
    const calls: string[] = [];
    const flowStore = new MemoryVoteStore(calls);
    flowStore.deals.set(DEAL, { status: "published", validUntil: future, score: 0 });
    const rateLimit = async () => {
      calls.push("rateLimit");
      return limit;
    };
    return { calls, flowStore, deps: { rateLimit, store: flowStore } };
  }

  it("checks the rate limit before any vote read or write, then locks, reads, writes, scores", async () => {
    const { calls, deps } = setup(allow);
    const outcome = await castVoteFlow(deps, "u1", DEAL, 1, now);
    expect(outcome.kind).toBe("ok");
    expect(calls).toEqual(["rateLimit", "lockDeal", "getVote", "setVote", "addScore"]);
  });

  it("deletes instead of upserting when removing a vote", async () => {
    const { calls, flowStore, deps } = setup(allow);
    await castVoteFlow(deps, "u1", DEAL, 1, now);
    calls.length = 0;
    await castVoteFlow(deps, "u1", DEAL, 0, now);
    expect(calls).toEqual(["rateLimit", "lockDeal", "getVote", "deleteVote", "addScore"]);
    expect(flowStore.deals.get(DEAL)!.score).toBe(0);
  });

  it("leaves votes and score untouched when rate limited", async () => {
    const { calls, flowStore, deps } = setup(deny);
    const outcome = await castVoteFlow(deps, "u1", DEAL, 1, now);
    expect(calls).toEqual(["rateLimit"]);
    expect(flowStore.votes.size).toBe(0);
    expect(flowStore.deals.get(DEAL)!.score).toBe(0);
    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.error.code).toBe("rate_limited");
    expect(outcome.error.message).toBe("rate_limited:42");
    expect(outcome.error.retryAfterSeconds).toBe(42);
  });

  it.each([
    ["missing", "22222222-2222-4222-8222-222222222222", "deal_not_found"],
    ["unpublished", DEAL, "deal_not_votable"],
  ] as const)("a %s deal still consumes the rate limit and is returned, not thrown", async (label, dealId, code) => {
    const { calls, flowStore, deps } = setup(allow);
    if (label === "unpublished") flowStore.deals.get(DEAL)!.status = "hidden";
    const outcome = await castVoteFlow(deps, "u1", dealId, 1, now);
    expect(calls[0]).toBe("rateLimit");
    expect(outcome.kind === "error" && outcome.error.code).toBe(code);
    expect(flowStore.votes.size).toBe(0);
  });

  it("rejects a signed-out user before touching the rate limit", async () => {
    const { calls, deps } = setup(allow);
    const outcome = await castVoteFlow(deps, null, DEAL, 1, now);
    expect(calls).toEqual([]);
    expect(outcome.kind === "error" && outcome.error.code).toBe("unauthorized");
  });

  it("propagates unexpected errors so the transaction rolls back", async () => {
    const { deps, flowStore } = setup(allow);
    flowStore.addScore = async () => {
      throw new Error("boom");
    };
    await expect(castVoteFlow(deps, "u1", DEAL, 1, now)).rejects.toThrow("boom");
  });
});

describe("vote error helpers", () => {
  it("round-trips codes and retry delays through the message", () => {
    const limited = new Error(new VoteError("rate_limited", 12).message);
    expect(voteErrorCode(limited)).toBe("rate_limited");
    expect(voteRetryAfter(limited)).toBe(12);
    expect(voteErrorCode(new Error("deal_not_found"))).toBe("deal_not_found");
    expect(voteRetryAfter(new Error("deal_not_found"))).toBeNull();
    expect(voteErrorCode(new Error("internal_error"))).toBe("internal_error");
  });

  it("ignores unrelated errors", () => {
    expect(voteErrorCode(new Error("connection refused"))).toBeNull();
    expect(voteErrorCode(new Error("rate_limited:abc"))).toBeNull();
    expect(voteErrorCode("deal_not_found")).toBeNull();
  });
});
