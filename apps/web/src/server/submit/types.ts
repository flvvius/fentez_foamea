import type { ExtractionResult } from "@fentezfoamea/core";

export type ExtractionStatus = "ok" | "unavailable" | "failed";

/** An active deal that already has this source. */
export type DuplicateResult = { status: "duplicate"; dealId: string; title: string };

export type NeedsScreenshotReason = "instagram" | "unsupported_platform" | "fetch_failed" | "unsupported_content" | "empty";

export type ExtractFromUrlResult =
  | DuplicateResult
  | { status: "needs_screenshot"; reason: NeedsScreenshotReason; normalizedUrl: string }
  | {
      status: "extracted";
      normalizedUrl: string;
      finalUrl: string;
      platform: "web" | "tiktok";
      postedAt: string | null;
      sourceTitle: string | null;
      /** The page's og:image. Data only: the server never fetched it. */
      imageUrl: string | null;
      /** null unless extractionStatus is "ok". The form falls back to manual entry. */
      extraction: ExtractionResult | null;
      extractionStatus: ExtractionStatus;
    };

export type ExtractFromImageResult = {
  extraction: ExtractionResult | null;
  extractionStatus: ExtractionStatus;
};

/**
 * `sourceUrl` must be the URL the user typed or pasted, not `finalUrl` (where redirects ended):
 * extractFromUrl checked that one for duplicates, so submitting the same one keeps the
 * dedup keys equal.
 */
export type SubmitDealResult = DuplicateResult | { status: "created"; dealId: string };

export type UploadImageResult = { imageId: string };
