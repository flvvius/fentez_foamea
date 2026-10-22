import type { ExtractionResult } from "@fentezfoamea/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceContent } from "../content/load-source";
import type { ExtractDealOutcome } from "../llm/extract-deal";
import { FetchFailedError, UnsafeUrlError } from "../net/safe-fetch";
import { SubmitError } from "./errors";
import { extractFromUrlFlow, type ExtractUrlDeps } from "./extract-url";
import type { DuplicateResult } from "./types";

const NOW = new Date("2026-10-22T12:00:00Z");
const URL_IN = "https://www.example.com/promo/?utm_source=ig";
const NORMALIZED = "https://example.com/promo";

const textSource: SourceContent = {
  kind: "text",
  platform: "web",
  url: URL_IN,
  finalUrl: "https://example.com/promo-final",
  title: "Promo page",
  text: "2 pizza la pretul de una, doar vineri la Pizzeria Roma",
  postedAt: "2026-10-20T09:00:00.000Z",
  imageUrl: "https://example.com/og.jpg",
};

const result = { isDeal: true, confidence: 0.8 } as unknown as ExtractionResult;

type Fakes = {
  deps: ExtractUrlDeps;
  order: string[];
  findDuplicate: ReturnType<typeof vi.fn>;
  consumeUserLimit: ReturnType<typeof vi.fn>;
  consumeBudget: ReturnType<typeof vi.fn>;
  loadSource: ReturnType<typeof vi.fn>;
  extractDeal: ReturnType<typeof vi.fn>;
};

function setup(
  opts: {
    duplicate?: DuplicateResult | null;
    userLimit?: () => Promise<void>;
    budget?: () => Promise<void>;
    source?: () => Promise<SourceContent>;
    outcome?: ExtractDealOutcome;
    available?: boolean;
  } = {},
): Fakes {
  const order: string[] = [];
  const findDuplicate = vi.fn(async () => {
    order.push("findDuplicate");
    return opts.duplicate ?? null;
  });
  const consumeUserLimit = vi.fn(async () => {
    order.push("userLimit");
    await opts.userLimit?.();
  });
  const consumeBudget = vi.fn(async () => {
    order.push("budget");
    await opts.budget?.();
  });
  const loadSource = vi.fn(async () => {
    order.push("loadSource");
    return opts.source ? opts.source() : textSource;
  });
  const extractDeal = vi.fn(async () => {
    order.push("extractDeal");
    return opts.outcome ?? ({ status: "ok", result, model: "m" } as ExtractDealOutcome);
  });
  return {
    deps: {
      now: () => NOW,
      findDuplicate,
      consumeUserLimit,
      consumeBudget,
      extractionAvailable: () => opts.available ?? true,
      loadSource,
      extractDeal,
    } as ExtractUrlDeps,
    order,
    findDuplicate,
    consumeUserLimit,
    consumeBudget,
    loadSource,
    extractDeal,
  };
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected an error");
}

let f: Fakes;
beforeEach(() => {
  f = setup();
});

describe("extractFromUrlFlow: before any work", () => {
  it("rejects a signed-out caller", async () => {
    expect((await failure(extractFromUrlFlow(f.deps, null, URL_IN))).message).toBe("unauthorized");
    expect(f.order).toEqual([]);
  });

  it.each(["", "not a url", "ftp://example.com/x", "javascript:alert(1)", `https://example.com/${"a".repeat(2100)}`])(
    "rejects %j as invalid_url",
    async (url) => {
      const error = (await failure(extractFromUrlFlow(f.deps, "u1", url))) as SubmitError;
      expect(error.message).toBe("invalid_url");
      expect(error.status).toBe(400);
      expect(f.order).toEqual([]);
    },
  );

  it("answers a duplicate before the rate limit is touched", async () => {
    f = setup({ duplicate: { status: "duplicate", dealId: "d1", title: "Existing" } });
    expect(await extractFromUrlFlow(f.deps, "u1", URL_IN)).toEqual({ status: "duplicate", dealId: "d1", title: "Existing" });
    expect(f.findDuplicate).toHaveBeenCalledWith(NORMALIZED, NOW);
    expect(f.order).toEqual(["findDuplicate"]);
  });
});

describe("extractFromUrlFlow: limits", () => {
  it("passes a per-user denial through and fetches nothing", async () => {
    f = setup({
      userLimit: async () => {
        throw SubmitError.rateLimited(120);
      },
    });
    expect((await failure(extractFromUrlFlow(f.deps, "u1", URL_IN))).message).toBe("rate_limited:120");
    expect(f.loadSource).not.toHaveBeenCalled();
    expect(f.consumeBudget).not.toHaveBeenCalled();
    expect(f.extractDeal).not.toHaveBeenCalled();
  });

  it("passes a spent global budget through, after the page was loaded, and does not call the model", async () => {
    f = setup({
      budget: async () => {
        throw SubmitError.budgetExhausted(3600);
      },
    });
    const error = (await failure(extractFromUrlFlow(f.deps, "u1", URL_IN))) as SubmitError;
    expect(error.message).toBe("budget_exhausted");
    expect(error.status).toBe(429);
    expect(f.order).toEqual(["findDuplicate", "userLimit", "loadSource", "budget"]);
    expect(f.extractDeal).not.toHaveBeenCalled();
  });

  it.each([
    "https://www.instagram.com/p/ABC123/?igsh=1",
    "https://instagram.com./reel/XYZ/",
    "https://m.facebook.com/somepage/posts/1",
  ])("charges nothing for a platform we never fetch: %s", async (url) => {
    const result = await extractFromUrlFlow(f.deps, "u1", url);
    expect(result).toMatchObject({ status: "needs_screenshot" });
    expect(f.consumeUserLimit).not.toHaveBeenCalled();
    expect(f.consumeBudget).not.toHaveBeenCalled();
    expect(f.loadSource).not.toHaveBeenCalled();
  });

  it("names the reason for a platform we never fetch", async () => {
    expect(await extractFromUrlFlow(f.deps, "u1", "https://www.instagram.com/p/ABC123/?igsh=1")).toEqual({
      status: "needs_screenshot",
      reason: "instagram",
      normalizedUrl: "https://instagram.com/p/ABC123",
    });
    expect(await extractFromUrlFlow(f.deps, "u1", "https://www.facebook.com/x/posts/1")).toMatchObject({
      reason: "unsupported_platform",
    });
  });

  it("does not use the global budget when the page cannot be used (needs_screenshot)", async () => {
    f = setup({ source: async () => ({ kind: "needs_screenshot", url: URL_IN, reason: "fetch_failed" }) });
    await extractFromUrlFlow(f.deps, "u1", URL_IN);
    expect(f.consumeUserLimit).toHaveBeenCalledTimes(1);
    expect(f.consumeBudget).not.toHaveBeenCalled();
  });

  it("does not use the global budget when no model is configured", async () => {
    f = setup({ available: false, outcome: { status: "unavailable" } });
    expect(await extractFromUrlFlow(f.deps, "u1", URL_IN)).toMatchObject({ extractionStatus: "unavailable" });
    expect(f.consumeUserLimit).toHaveBeenCalledTimes(1);
    expect(f.consumeBudget).not.toHaveBeenCalled();
  });
});

describe("extractFromUrlFlow: loading", () => {
  it("maps every UnsafeUrlError to url_not_allowed and nothing more", async () => {
    for (const code of ["bad_scheme", "bad_port", "credentials", "private_address", "dns_failed", "too_many_redirects", "bad_url"] as const) {
      f = setup({
        source: async () => {
          throw new UnsafeUrlError(code);
        },
      });
      const error = (await failure(extractFromUrlFlow(f.deps, "u1", URL_IN))) as SubmitError;
      expect(error).toBeInstanceOf(SubmitError);
      expect(error.message).toBe("url_not_allowed");
      expect(error.status).toBe(400);
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(error)).not.toContain(code);
      expect(f.extractDeal).not.toHaveBeenCalled();
      // The fetch cost us, so the user's own limit counts; the global budget is for model calls.
      expect(f.consumeUserLimit).toHaveBeenCalledTimes(1);
      expect(f.consumeBudget).not.toHaveBeenCalled();
    }
  });

  it("does not turn other fetch errors into client-visible details", async () => {
    const secret = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    f = setup({
      source: async () => {
        throw new FetchFailedError("network", undefined, { cause: secret });
      },
    });
    const error = await failure(extractFromUrlFlow(f.deps, "u1", URL_IN));
    // Left as it is for the server fn wrapper, which logs it and answers internal_error.
    expect(error).not.toBeInstanceOf(SubmitError);
  });

  it("passes needs_screenshot through", async () => {
    f = setup({ source: async () => ({ kind: "needs_screenshot", url: URL_IN, reason: "instagram" }) });
    expect(await extractFromUrlFlow(f.deps, "u1", URL_IN)).toEqual({
      status: "needs_screenshot",
      reason: "instagram",
      normalizedUrl: NORMALIZED,
    });
    expect(f.extractDeal).not.toHaveBeenCalled();
  });

  it("loads the page the user gave (without credentials), not the normalized form", async () => {
    await extractFromUrlFlow(f.deps, "u1", "https://u:p@www.example.com/promo/?utm_source=ig#frag");
    expect(f.loadSource).toHaveBeenCalledWith("https://www.example.com/promo/?utm_source=ig");
  });
});

describe("extractFromUrlFlow: extraction", () => {
  it("runs checks in the right order", async () => {
    await extractFromUrlFlow(f.deps, "u1", URL_IN);
    expect(f.order).toEqual(["findDuplicate", "userLimit", "loadSource", "budget", "extractDeal"]);
  });

  it("returns the extraction with the page's data", async () => {
    expect(await extractFromUrlFlow(f.deps, "u1", URL_IN)).toEqual({
      status: "extracted",
      normalizedUrl: NORMALIZED,
      finalUrl: "https://example.com/promo-final",
      platform: "web",
      postedAt: "2026-10-20T09:00:00.000Z",
      sourceTitle: "Promo page",
      imageUrl: "https://example.com/og.jpg",
      extraction: result,
      extractionStatus: "ok",
    });
    expect(f.extractDeal).toHaveBeenCalledWith({
      kind: "text",
      text: textSource.kind === "text" ? textSource.text : "",
      sourceUrl: "https://example.com/promo-final",
      postedAt: "2026-10-20T09:00:00.000Z",
    });
  });

  it.each([
    [{ status: "unavailable" } as ExtractDealOutcome, "unavailable"],
    [{ status: "failed", reason: "timeout" } as ExtractDealOutcome, "failed"],
    [{ status: "failed", reason: "provider_error" } as ExtractDealOutcome, "failed"],
  ])("returns a normal result for %j so the form can be filled by hand", async (outcome, status) => {
    f = setup({ outcome });
    expect(await extractFromUrlFlow(f.deps, "u1", URL_IN)).toMatchObject({
      status: "extracted",
      extraction: null,
      extractionStatus: status,
      sourceTitle: "Promo page",
    });
  });
});
