import { screenshotOnlyReason, type SourceContent } from "../content/load-source";
import { UnsafeUrlError } from "../net/safe-fetch";
import type { ExtractDealOutcome } from "../llm/extract-deal";
import type { ExtractionInput } from "../llm/provider";
import { SubmitError } from "./errors";
import { parseSourceLink } from "./source-link";
import type { DuplicateResult, ExtractFromUrlResult } from "./types";

export type ExtractUrlDeps = {
  now: () => Date;
  /** A deal that blocks this normalized source url (see findDuplicateDeal). */
  findDuplicate: (normalizedUrl: string, now: Date) => Promise<DuplicateResult | null>;
  /** The per-user extraction limit (the fetch costs us); throws a SubmitError when denied. */
  consumeUserLimit: (userId: string) => Promise<void>;
  /** The global daily budget of model calls; throws budget_exhausted when spent. */
  consumeBudget: () => Promise<void>;
  /** false when no model is configured: nothing then reaches a model, so the budget is not used. */
  extractionAvailable: () => boolean;
  loadSource: (url: string) => Promise<SourceContent>;
  extractDeal: (input: ExtractionInput) => Promise<ExtractDealOutcome>;
};

/**
 * Charges only for what costs us something, in order: a duplicate is free; platforms we never
 * fetch (Instagram, Facebook) are free; the per-user limit is used before the page is
 * fetched; the global budget only when the text is about to go to the model. A failed load
 * (including an unsafe url) therefore never touches the global budget. A failed or
 * unavailable extraction is a normal result: the user fills the form by hand.
 */
export async function extractFromUrlFlow(
  deps: ExtractUrlDeps,
  userId: string | null,
  rawUrl: string,
): Promise<ExtractFromUrlResult> {
  if (!userId) throw SubmitError.of("unauthorized");
  const link = parseSourceLink(rawUrl);
  if (!link) throw SubmitError.of("invalid_url");

  const duplicate = await deps.findDuplicate(link.normalized, deps.now());
  if (duplicate) return duplicate;

  const screenshotOnly = screenshotOnlyReason(new URL(link.sourceUrl));
  if (screenshotOnly) {
    return { status: "needs_screenshot", reason: screenshotOnly, normalizedUrl: link.normalized };
  }

  await deps.consumeUserLimit(userId);

  let source: SourceContent;
  try {
    source = await deps.loadSource(link.sourceUrl);
  } catch (error) {
    // Every unsafe-url reason is one code: telling them apart would let callers probe the
    // server's network. Anything else is unexpected and handled (and logged) by the caller.
    if (error instanceof UnsafeUrlError) throw SubmitError.of("url_not_allowed");
    throw error;
  }

  if (source.kind === "needs_screenshot") {
    return { status: "needs_screenshot", reason: source.reason, normalizedUrl: link.normalized };
  }

  if (deps.extractionAvailable()) await deps.consumeBudget();
  const outcome = await deps.extractDeal({
    kind: "text",
    text: source.text,
    sourceUrl: source.finalUrl,
    postedAt: source.postedAt,
  });
  return {
    status: "extracted",
    normalizedUrl: link.normalized,
    finalUrl: source.finalUrl,
    platform: source.platform,
    postedAt: source.postedAt,
    sourceTitle: source.title,
    imageUrl: source.imageUrl,
    extraction: outcome.status === "ok" ? outcome.result : null,
    extractionStatus: outcome.status,
  };
}
