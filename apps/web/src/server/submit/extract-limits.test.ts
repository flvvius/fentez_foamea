import { describe, expect, it, vi } from "vitest";
import type { RateLimitOptions, RateLimitResult } from "../deals/rate-limit";
import { SubmitError } from "./errors";
import { consumeExtractBudget, consumeExtractLimits, consumeUserExtractLimit } from "./extract-limits";

const config = { extractPerHour: 10, extractDailyBudget: 300 };
const ok: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

async function failure(promise: Promise<unknown>): Promise<SubmitError> {
  try {
    await promise;
  } catch (error) {
    return error as SubmitError;
  }
  throw new Error("expected a SubmitError");
}

describe("consumeExtractLimits", () => {
  it("consumes the user bucket (per hour) and then the global bucket (per day)", async () => {
    const consume = vi.fn(async (_o: RateLimitOptions) => ok);
    await consumeExtractLimits(consume, "u1", config);
    expect(consume.mock.calls.map(([o]) => o)).toEqual([
      { userId: "u1", action: "extract", limit: 10, windowSeconds: 3600 },
      { userId: null, action: "extract_budget", limit: 300, windowSeconds: 86_400 },
    ]);
  });

  it("maps a denied user bucket to rate_limited:<seconds> and leaves the global budget alone", async () => {
    const consume = vi.fn(async (o: RateLimitOptions) => (o.userId === "u1" ? { allowed: false, retryAfterSeconds: 90 } : ok));
    const error = await failure(consumeExtractLimits(consume, "u1", config));
    expect(error.message).toBe("rate_limited:90");
    expect(error.status).toBe(429);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("maps a denied global budget to budget_exhausted", async () => {
    const consume = vi.fn(async (o: RateLimitOptions) => (o.userId === null ? { allowed: false, retryAfterSeconds: 5000 } : ok));
    const error = await failure(consumeExtractLimits(consume, "u1", config));
    expect(error.message).toBe("budget_exhausted");
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(5000);
  });
});

describe("the two limits on their own", () => {
  it("consumeUserExtractLimit touches only the per-user bucket", async () => {
    const consume = vi.fn(async (_o: RateLimitOptions) => ok);
    await consumeUserExtractLimit(consume, "u1", config);
    expect(consume.mock.calls.map(([o]) => o)).toEqual([{ userId: "u1", action: "extract", limit: 10, windowSeconds: 3600 }]);
  });

  it("consumeExtractBudget touches only the global bucket", async () => {
    const consume = vi.fn(async (_o: RateLimitOptions) => ok);
    await consumeExtractBudget(consume, config);
    expect(consume.mock.calls.map(([o]) => o)).toEqual([
      { userId: null, action: "extract_budget", limit: 300, windowSeconds: 86_400 },
    ]);
  });

  it("each maps its own denial", async () => {
    const deny = async () => ({ allowed: false, retryAfterSeconds: 8 });
    expect((await failure(consumeUserExtractLimit(deny, "u1", config))).message).toBe("rate_limited:8");
    expect((await failure(consumeExtractBudget(deny, config))).message).toBe("budget_exhausted");
  });
});
