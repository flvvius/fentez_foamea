import type { RateLimitOptions, RateLimitResult } from "../deals/rate-limit";
import { SubmitError } from "./errors";

export type ExtractLimitConfig = { extractPerHour: number; extractDailyBudget: number };
export type ConsumeRateLimit = (options: RateLimitOptions) => Promise<RateLimitResult>;

export const EXTRACT_ACTION = "extract";
export const EXTRACT_BUDGET_ACTION = "extract_budget";

/** The per-user limit: a link read costs us a fetch, an image read costs us a model call. */
export async function consumeUserExtractLimit(
  consume: ConsumeRateLimit,
  userId: string,
  config: ExtractLimitConfig,
): Promise<void> {
  const own = await consume({ userId, action: EXTRACT_ACTION, limit: config.extractPerHour, windowSeconds: 3600 });
  if (!own.allowed) throw SubmitError.rateLimited(own.retryAfterSeconds);
}

/** The global daily budget of model calls, shared by everyone. */
export async function consumeExtractBudget(consume: ConsumeRateLimit, config: ExtractLimitConfig): Promise<void> {
  const global = await consume({
    userId: null,
    action: EXTRACT_BUDGET_ACTION,
    limit: config.extractDailyBudget,
    windowSeconds: 86_400,
  });
  if (!global.allowed) throw SubmitError.budgetExhausted(global.retryAfterSeconds);
}

/**
 * Both limits, or a thrown SubmitError. Run it in one transaction: when the global budget is
 * spent after the user's own limit passed, the throw rolls the user's event back, so a user is
 * not charged for an exhausted budget.
 */
export async function consumeExtractLimits(
  consume: ConsumeRateLimit,
  userId: string,
  config: ExtractLimitConfig,
): Promise<void> {
  await consumeUserExtractLimit(consume, userId, config);
  await consumeExtractBudget(consume, config);
}
