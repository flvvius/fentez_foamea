import { GeminiExtractionProvider } from "./gemini.ts";
import type { ExtractionProvider } from "./provider.ts";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

// The result is memoized, a missing key included: after adding GEMINI_API_KEY to .env, restart the dev server.
let cached: { provider: ExtractionProvider | null } | undefined;

/**
 * The configured provider, or null when no API key is set so callers can fall back to manual
 * entry. An unknown DEALS_LLM_PROVIDER throws: that is a deployment mistake worth failing on.
 */
export function getExtractionProvider(): ExtractionProvider | null {
  if (cached) return cached.provider;

  const name = (process.env.DEALS_LLM_PROVIDER?.trim() || "gemini").toLowerCase();
  if (name !== "gemini") {
    throw new Error(`Unsupported DEALS_LLM_PROVIDER "${name}". Only "gemini" is supported.`);
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.DEALS_LLM_MODEL?.trim() || DEFAULT_MODEL;
  cached = { provider: apiKey ? new GeminiExtractionProvider(apiKey, model) : null };
  return cached.provider;
}

export function resetExtractionProviderForTests(): void {
  cached = undefined;
}

export type { ExtractionInput, ExtractionProvider } from "./provider.ts";
export { ExtractionProviderError } from "./provider.ts";
export { extractDeal } from "./extract-deal.ts";
export { prepareContentText } from "./prepare.ts";
