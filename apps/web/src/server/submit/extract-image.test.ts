import type { ExtractionResult } from "@fentezfoamea/core";
import { describe, expect, it, vi } from "vitest";
import type { ExtractDealOutcome } from "../llm/extract-deal";
import { SubmitError } from "./errors";
import { extractFromImageFlow, type ExtractImageDeps, type StoredImage } from "./extract-image";

const IMAGE = "11111111-1111-4111-8111-111111111111";
const input = { imageId: IMAGE, caption: "oferta vineri", postedAt: "2026-10-20T09:00:00.000Z" };
const stored: StoredImage = { mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) };
const result = { isDeal: true, confidence: 0.6 } as unknown as ExtractionResult;

function setup(
  opts: { image?: StoredImage | null; consume?: () => Promise<void>; outcome?: ExtractDealOutcome; available?: boolean } = {},
) {
  const order: string[] = [];
  const findOwnedImage = vi.fn(async (_id: string, _user: string) => {
    order.push("findOwnedImage");
    return opts.image === undefined ? stored : opts.image;
  });
  const consume = vi.fn(async (_user: string) => {
    order.push("consume");
    await opts.consume?.();
  });
  const extractDeal = vi.fn(async () => {
    order.push("extractDeal");
    return opts.outcome ?? ({ status: "ok", result, model: "m" } as ExtractDealOutcome);
  });
  const deps = {
    findOwnedImage,
    consumeExtractLimits: consume,
    extractionAvailable: () => opts.available ?? true,
    extractDeal,
  } as ExtractImageDeps;
  return { deps, order, findOwnedImage, consume, extractDeal };
}

async function failure(promise: Promise<unknown>): Promise<SubmitError> {
  try {
    await promise;
  } catch (error) {
    return error as SubmitError;
  }
  throw new Error("expected a SubmitError");
}

describe("extractFromImageFlow", () => {
  it("rejects a signed-out caller", async () => {
    const f = setup();
    expect((await failure(extractFromImageFlow(f.deps, null, input))).message).toBe("unauthorized");
    expect(f.order).toEqual([]);
  });

  it("answers image_not_found for an image that is missing or someone else's, before any limit", async () => {
    const f = setup({ image: null });
    const error = await failure(extractFromImageFlow(f.deps, "u1", input));
    expect(error.message).toBe("image_not_found");
    expect(error.status).toBe(404);
    expect(f.findOwnedImage).toHaveBeenCalledWith(IMAGE, "u1");
    expect(f.consume).not.toHaveBeenCalled();
    expect(f.extractDeal).not.toHaveBeenCalled();
  });

  it("passes a per-user denial through and does not call the model", async () => {
    const f = setup({
      consume: async () => {
        throw SubmitError.rateLimited(30);
      },
    });
    expect((await failure(extractFromImageFlow(f.deps, "u1", input))).message).toBe("rate_limited:30");
    expect(f.extractDeal).not.toHaveBeenCalled();
  });

  it("passes a spent global budget through", async () => {
    const f = setup({
      consume: async () => {
        throw SubmitError.budgetExhausted(1000);
      },
    });
    expect((await failure(extractFromImageFlow(f.deps, "u1", input))).message).toBe("budget_exhausted");
    expect(f.extractDeal).not.toHaveBeenCalled();
  });

  it("charges nothing when no model is configured", async () => {
    const f = setup({ available: false, outcome: { status: "unavailable" } });
    expect(await extractFromImageFlow(f.deps, "u1", input)).toEqual({ extraction: null, extractionStatus: "unavailable" });
    expect(f.consume).not.toHaveBeenCalled();
  });

  it("extracts from the stored bytes and the caption", async () => {
    const f = setup();
    expect(await extractFromImageFlow(f.deps, "u1", input)).toEqual({ extraction: result, extractionStatus: "ok" });
    expect(f.order).toEqual(["findOwnedImage", "consume", "extractDeal"]);
    expect(f.consume).toHaveBeenCalledWith("u1");
    expect(f.extractDeal).toHaveBeenCalledWith({
      kind: "image",
      mimeType: "image/png",
      data: stored.bytes,
      caption: "oferta vineri",
      postedAt: "2026-10-20T09:00:00.000Z",
    });
  });

  it.each([
    [{ status: "unavailable" } as ExtractDealOutcome, "unavailable"],
    [{ status: "failed", reason: "provider_error" } as ExtractDealOutcome, "failed"],
  ])("returns a normal result for %j", async (outcome, status) => {
    const f = setup({ outcome });
    expect(await extractFromImageFlow(f.deps, "u1", input)).toEqual({ extraction: null, extractionStatus: status });
  });
});
