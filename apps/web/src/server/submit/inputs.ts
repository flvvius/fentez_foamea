import { InvalidInputError } from "../deals/inputs";
import { UUID_RE } from "../deals/uuid";
import { MAX_URL_LENGTH } from "./source-link";
import type { ExtractImageInput } from "./extract-image";
import type { SubmitDealInput } from "./submit-deal";

// Shape checks only, by hand like deals/inputs.ts. Whether a url is usable and whether the
// draft is valid is decided by the flows, which answer with a specific code.

export const MAX_CAPTION_CHARS = 2000;

function record(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new InvalidInputError();
  return data as Record<string, unknown>;
}

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max) throw new InvalidInputError();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new InvalidInputError();
  return value.toLowerCase();
}

export function parseExtractUrlInput(data: unknown): { url: string } {
  const { url } = record(data);
  if (typeof url !== "string" || url.length > MAX_URL_LENGTH) throw new InvalidInputError();
  return { url };
}

export function parseExtractImageInput(data: unknown): ExtractImageInput {
  const { imageId, caption, postedAt } = record(data);
  const postedAtText = optionalString(postedAt, 64);
  if (postedAtText !== null && Number.isNaN(Date.parse(postedAtText))) throw new InvalidInputError();
  const captionText = optionalString(caption, MAX_CAPTION_CHARS)?.trim();
  return {
    imageId: uuid(imageId),
    caption: captionText ? captionText : null,
    postedAt: postedAtText === null ? null : new Date(postedAtText).toISOString(),
  };
}

export function parseSubmitDealInput(data: unknown): SubmitDealInput {
  const { draft, sourceUrl, imageId, extraction } = record(data);
  // sourceUrl length is not capped here: parseSourceLink answers "invalid_url" for too long.
  if (sourceUrl !== undefined && sourceUrl !== null && typeof sourceUrl !== "string") throw new InvalidInputError();
  const source = typeof sourceUrl === "string" && sourceUrl.trim() !== "" ? sourceUrl : null;

  let meta: SubmitDealInput["extraction"] = null;
  if (extraction !== undefined && extraction !== null) {
    const { evidenceSnippet, confidence, source: extractionSource } = record(extraction);
    if (extractionSource !== "text" && extractionSource !== "image" && extractionSource !== "manual") {
      throw new InvalidInputError();
    }
    if (confidence !== undefined && confidence !== null && typeof confidence !== "number") throw new InvalidInputError();
    meta = {
      evidenceSnippet: optionalString(evidenceSnippet, 5000),
      confidence: typeof confidence === "number" ? confidence : null,
      source: extractionSource,
    };
  }
  return {
    draft,
    sourceUrl: source,
    imageId: imageId === undefined || imageId === null || imageId === "" ? null : uuid(imageId),
    extraction: meta,
  };
}
