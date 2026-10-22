export type DealsConfig = {
  /** A deal is hidden from feeds once its score drops below this (so -5 still shows, -6 hides). */
  hideScore: number;
  extractPerHour: number;
  submitPerDay: number;
  extractDailyBudget: number;
};

type Env = Record<string, string | undefined>;

function intFromEnv(env: Env, name: string, fallback: number, min?: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  if (!/^-?\d+$/.test(raw)) throw new Error(`${name} must be an integer, got "${raw}"`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} is out of range: "${raw}"`);
  if (min !== undefined && value < min) throw new Error(`${name} must be >= ${min}, got ${value}`);
  return value;
}

export function parseDealsConfig(env: Env): DealsConfig {
  return {
    hideScore: intFromEnv(env, "DEALS_HIDE_SCORE", -5),
    extractPerHour: intFromEnv(env, "DEALS_EXTRACT_PER_HOUR", 10, 1),
    submitPerDay: intFromEnv(env, "DEALS_SUBMIT_PER_DAY", 5, 1),
    extractDailyBudget: intFromEnv(env, "DEALS_EXTRACT_DAILY_BUDGET", 300, 1),
  };
}

let cached: DealsConfig | undefined;

export function getDealsConfig(): DealsConfig {
  cached ??= parseDealsConfig(process.env);
  return cached;
}
