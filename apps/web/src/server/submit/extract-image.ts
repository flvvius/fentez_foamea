import type { ExtractDealOutcome } from "../llm/extract-deal";
import type { ExtractionInput } from "../llm/provider";
import { SubmitError } from "./errors";
import type { ImageMime } from "./image-type";
import type { ExtractFromImageResult } from "./types";

export type StoredImage = { mimeType: ImageMime; bytes: Uint8Array };

export type ExtractImageDeps = {
  /** The image, only if `userId` uploaded it. */
  findOwnedImage: (imageId: string, userId: string) => Promise<StoredImage | null>;
  /** Per-user limit and global budget in one transaction. */
  consumeExtractLimits: (userId: string) => Promise<void>;
  /** false when no model is configured: nothing then reaches a model, so nothing is charged. */
  extractionAvailable: () => boolean;
  extractDeal: (input: ExtractionInput) => Promise<ExtractDealOutcome>;
};

export type ExtractImageInput = { imageId: string; caption: string | null; postedAt: string | null };

export async function extractFromImageFlow(
  deps: ExtractImageDeps,
  userId: string | null,
  input: ExtractImageInput,
): Promise<ExtractFromImageResult> {
  if (!userId) throw SubmitError.of("unauthorized");
  const image = await deps.findOwnedImage(input.imageId, userId);
  if (!image) throw SubmitError.of("image_not_found");

  if (deps.extractionAvailable()) await deps.consumeExtractLimits(userId);

  const outcome = await deps.extractDeal({
    kind: "image",
    mimeType: image.mimeType,
    data: image.bytes,
    caption: input.caption,
    postedAt: input.postedAt,
  });
  return {
    extraction: outcome.status === "ok" ? outcome.result : null,
    extractionStatus: outcome.status,
  };
}
