import { dealDraftSchema, type DealChannel, type DealFlag, type DealType } from "@fentezfoamea/core";
import type { RateLimitResult } from "../deals/rate-limit";
import { UUID_RE } from "../deals/uuid";
import { computePriceFields, defaultValidUntil, isPlausibleInstant, latestValidFrom, latestValidUntil } from "./deal-fields";
import { SubmitError } from "./errors";
import { parseSourceLink } from "./source-link";
import type { DuplicateResult, SubmitDealResult } from "./types";

export const SUBMIT_ACTION = "submit";
export const MAX_EVIDENCE_CHARS = 500;

export type SubmitDealInput = {
  /** Validated here with dealDraftSchema. */
  draft: unknown;
  /** The URL the user typed (not extractFromUrl's finalUrl), so dedup keys match the extract step's. */
  sourceUrl: string | null;
  imageId: string | null;
  /**
   * Metadata the client says the pre-fill produced. It is not trusted and never shown
   * publicly: it only helps us measure how often the model's suggestion was kept.
   */
  extraction: { evidenceSnippet: string | null; confidence: number | null; source: "text" | "image" | "manual" } | null;
};

/** One deals row, ready to insert. */
export type NewDealRow = {
  sourceType: "user";
  status: "published";
  restaurantName: string;
  title: string;
  description: string | null;
  dealType: DealType;
  dealPrice: number | null;
  regularPrice: number | null;
  percentOff: number | null;
  currency: string;
  notADiscount: boolean;
  daysOfWeek: number[] | null;
  timeStart: string | null;
  timeEnd: string | null;
  validFrom: string | null;
  validUntil: string;
  channel: DealChannel;
  flags: DealFlag[];
  promoCode: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  sourceUrl: string | null;
  sourceUrlNormalized: string | null;
  imageId: string | null;
  evidenceSnippet: string | null;
  llmConfidence: number | null;
  extractionSource: "text" | "image" | "manual";
  submittedBy: string;
};

/** What runs inside the one database transaction. */
export interface SubmitTx {
  /** Serializes submissions of the same source, so two at once cannot both pass the duplicate check. */
  lockSource(normalizedUrl: string): Promise<void>;
  findDuplicate(normalizedUrl: string, now: Date): Promise<DuplicateResult | null>;
  /** The per-user daily submit limit; records the submission when allowed. */
  rateLimit(): Promise<RateLimitResult>;
  insertDeal(row: NewDealRow): Promise<string>;
}

export type SubmitDealDeps = {
  now: () => Date;
  imageOwnedBy: (imageId: string, userId: string) => Promise<boolean>;
  transaction: <T>(run: (tx: SubmitTx) => Promise<T>) => Promise<T>;
};

// Postgres text cannot hold a NUL character; it would surface as a 500. Built from its code,
// not written as an escape, so no tool between here and the file can turn it into a real one.
const NUL = String.fromCharCode(0);

const blankToNull = (value: string | null): string | null => (value === null || value === "" ? null : value);

/**
 * The only way a deal is published. Everything the model suggested has been through the user's
 * form; everything the client could lie about (discount flag, percentage, expiry) is rebuilt
 * here. No network fetch of the source happens: the url is only normalized and stored.
 */
export async function submitDealFlow(
  deps: SubmitDealDeps,
  userId: string | null,
  input: SubmitDealInput,
): Promise<SubmitDealResult> {
  if (!userId) throw SubmitError.of("unauthorized");
  // The database CHECK enforces this too; failing here gives a clear code and costs nothing.
  if (input.sourceUrl === null && input.imageId === null) throw SubmitError.of("source_required");

  const link = input.sourceUrl === null ? null : parseSourceLink(input.sourceUrl);
  if (input.sourceUrl !== null && !link) throw SubmitError.of("invalid_url");

  if (input.imageId !== null) {
    if (!UUID_RE.test(input.imageId) || !(await deps.imageOwnedBy(input.imageId, userId))) {
      throw SubmitError.of("image_not_found");
    }
  }

  const parsed = dealDraftSchema.safeParse(input.draft);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.path[0];
    throw SubmitError.invalidDraft(typeof first === "string" ? first : undefined);
  }
  const draft = parsed.data;

  for (const [field, value] of Object.entries(draft)) {
    if (typeof value === "string" && value.includes(NUL)) throw SubmitError.invalidDraft(field);
  }

  const now = deps.now();
  let validFrom: string | null = null;
  if (draft.validFrom !== null) {
    const from = Date.parse(draft.validFrom);
    if (!isPlausibleInstant(from) || from > latestValidFrom(now)) throw SubmitError.invalidDraft("validFrom");
    validFrom = new Date(from).toISOString();
  }

  let validUntil: string;
  if (draft.validUntil === null) {
    validUntil = defaultValidUntil(now, validFrom);
  } else {
    const until = Date.parse(draft.validUntil);
    // A deal that has already ended would be published straight into "expired".
    if (!Number.isFinite(until) || until <= now.getTime()) throw SubmitError.invalidDraft("validUntil");
    // Too far ahead is clamped, as for extracted deals: the user's form need not know the limit.
    const limit = latestValidUntil(now, validFrom);
    validUntil = new Date(Math.min(until, Date.parse(limit))).toISOString();
  }
  if (!isPlausibleInstant(Date.parse(validUntil))) throw SubmitError.invalidDraft("validUntil");
  const prices = computePriceFields(draft);

  const evidence = input.extraction?.evidenceSnippet?.split(NUL).join("").trim().slice(0, MAX_EVIDENCE_CHARS) ?? null;
  const confidence = input.extraction?.confidence ?? null;

  const row: NewDealRow = {
    sourceType: "user",
    status: "published",
    restaurantName: draft.restaurantName,
    title: draft.title,
    description: blankToNull(draft.description),
    dealType: draft.dealType,
    dealPrice: draft.dealPrice,
    regularPrice: draft.regularPrice,
    percentOff: prices.percentOff,
    currency: draft.currency,
    notADiscount: prices.notADiscount,
    daysOfWeek: draft.daysOfWeek,
    timeStart: draft.timeStart,
    timeEnd: draft.timeEnd,
    validFrom,
    validUntil,
    channel: draft.channel,
    flags: draft.flags,
    promoCode: blankToNull(draft.promoCode),
    address: blankToNull(draft.address),
    lat: draft.lat,
    lon: draft.lon,
    sourceUrl: link?.sourceUrl ?? null,
    sourceUrlNormalized: link?.normalized ?? null,
    imageId: input.imageId,
    evidenceSnippet: evidence === "" ? null : evidence,
    llmConfidence: confidence === null || !Number.isFinite(confidence) ? null : Math.min(1, Math.max(0, confidence)),
    extractionSource: input.extraction?.source ?? "manual",
    submittedBy: userId,
  };

  return deps.transaction(async (tx): Promise<SubmitDealResult> => {
    if (link) {
      await tx.lockSource(link.normalized);
      const duplicate = await tx.findDuplicate(link.normalized, now);
      if (duplicate) return duplicate;
    }
    const limit = await tx.rateLimit();
    if (!limit.allowed) throw SubmitError.rateLimited(limit.retryAfterSeconds);
    return { status: "created", dealId: await tx.insertDeal(row) };
  });
}
