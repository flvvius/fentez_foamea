import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiExtractionProvider } from "./gemini.ts";
import { getExtractionProvider, resetExtractionProviderForTests } from "./index.ts";

beforeEach(() => {
  resetExtractionProviderForTests();
  vi.stubEnv("DEALS_LLM_PROVIDER", "");
  vi.stubEnv("DEALS_LLM_MODEL", "");
  vi.stubEnv("GEMINI_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetExtractionProviderForTests();
});

describe("getExtractionProvider", () => {
  it.each([[""], ["   "]])("returns null for a missing or blank key (%j)", (key) => {
    vi.stubEnv("GEMINI_API_KEY", key);
    expect(getExtractionProvider()).toBeNull();
  });

  it("defaults to gemini and gemini-3.1-flash-lite", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const provider = getExtractionProvider();
    expect(provider).toBeInstanceOf(GeminiExtractionProvider);
    expect(provider?.model).toBe("gemini-3.1-flash-lite");
  });

  it("honors DEALS_LLM_MODEL and an explicit gemini provider", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("DEALS_LLM_PROVIDER", " Gemini ");
    vi.stubEnv("DEALS_LLM_MODEL", "gemini-3-flash-preview");
    expect(getExtractionProvider()?.model).toBe("gemini-3-flash-preview");
  });

  it("throws a clear error for an unknown provider, even without a key", () => {
    vi.stubEnv("DEALS_LLM_PROVIDER", "openai");
    expect(() => getExtractionProvider()).toThrow(/DEALS_LLM_PROVIDER "openai"/);
    expect(() => getExtractionProvider()).toThrow(/gemini/);
  });

  it("memoizes the result, including null, until reset", () => {
    expect(getExtractionProvider()).toBeNull();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    expect(getExtractionProvider()).toBeNull();

    resetExtractionProviderForTests();
    const provider = getExtractionProvider();
    expect(provider).not.toBeNull();
    expect(getExtractionProvider()).toBe(provider);
  });
});
