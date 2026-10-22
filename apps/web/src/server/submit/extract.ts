import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { getSql } from "../db";
import { getDealsConfig } from "../deals/config";
import { loadSource } from "../content/load-source";
import { extractDeal } from "../llm/extract-deal";
import { getExtractionProvider } from "../llm";
import type { ExtractionInput } from "../llm/provider";
import { getCurrentUser } from "../session";
import { extractFromImageFlow } from "./extract-image";
import { extractFromUrlFlow } from "./extract-url";
import { NO_STORE, rethrowSubmitError } from "./http-errors";
import { parseExtractImageInput, parseExtractUrlInput } from "./inputs";
import { findDuplicateDeal, findOwnedImage, runExtractBudget, runExtractLimits, runUserExtractLimit } from "./store";
import type { ExtractFromImageResult, ExtractFromUrlResult } from "./types";

function validated<T>(parse: (data: unknown) => T) {
  return (data: unknown): T => {
    try {
      return parse(data);
    } catch (error) {
      setResponseStatus(400);
      throw error;
    }
  };
}

const extractWithProvider = (input: ExtractionInput) => extractDeal(input, { provider: getExtractionProvider() });

/**
 * Reads a link and suggests deal details for the post form. Nothing is published.
 * Resolves to { status: "duplicate", dealId, title } (an active deal already has this source),
 * { status: "needs_screenshot", reason, normalizedUrl } (Instagram etc.: ask for a screenshot),
 * or { status: "extracted", ... } where extractionStatus "unavailable" / "failed" means fill
 * the form by hand. Failures throw an Error whose message is the code: unauthorized 401,
 * invalid_input 400, invalid_url 400, url_not_allowed 400, rate_limited:<seconds> 429,
 * budget_exhausted 429, internal_error 500 (see errors.ts: submitErrorCode, submitRetryAfter).
 */
export const extractFromUrl = createServerFn({ method: "POST" })
  .validator(validated(parseExtractUrlInput))
  .handler(async ({ data }): Promise<ExtractFromUrlResult> => {
    setResponseHeaders(new Headers(NO_STORE));
    try {
      const user = await getCurrentUser();
      const sql = getSql();
      return await extractFromUrlFlow(
        {
          now: () => new Date(),
          findDuplicate: (normalizedUrl, now) => findDuplicateDeal(sql, normalizedUrl, now, getDealsConfig().hideScore),
          consumeUserLimit: (userId) => runUserExtractLimit(sql, userId),
          consumeBudget: () => runExtractBudget(sql),
          extractionAvailable: () => getExtractionProvider() !== null,
          loadSource: (url) => loadSource(url),
          extractDeal: extractWithProvider,
        },
        user?.id ?? null,
        data.url,
      );
    } catch (error) {
      return rethrowSubmitError(error);
    }
  });

/**
 * Reads an uploaded screenshot (see POST /api/deal-images) and suggests deal details.
 * Errors: unauthorized 401, invalid_input 400, image_not_found 404 (missing or not yours),
 * rate_limited:<seconds> 429, budget_exhausted 429, internal_error 500.
 */
export const extractFromImage = createServerFn({ method: "POST" })
  .validator(validated(parseExtractImageInput))
  .handler(async ({ data }): Promise<ExtractFromImageResult> => {
    setResponseHeaders(new Headers(NO_STORE));
    try {
      const user = await getCurrentUser();
      const sql = getSql();
      return await extractFromImageFlow(
        {
          findOwnedImage: (imageId, userId) => findOwnedImage(sql, imageId, userId),
          consumeExtractLimits: (userId) => runExtractLimits(sql, userId),
          extractionAvailable: () => getExtractionProvider() !== null,
          extractDeal: extractWithProvider,
        },
        user?.id ?? null,
        data,
      );
    } catch (error) {
      return rethrowSubmitError(error);
    }
  });
