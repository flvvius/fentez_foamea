import { z } from "zod";
import {
  DEAL_CHANNELS,
  DEAL_TYPES,
  dealDraftSchema,
  type DealChannel,
  type DealDraftInput,
  type DealType,
} from "./deal.ts";
import { discountPercent, parseRonPrice } from "./price.ts";
import { collapseWhitespace } from "./text.ts";
import { bucharestLocalToIso, bucharestToday } from "./time.ts";

/*
 * The model is cheap and untrusted. Everything it returns is parsed leniently into
 * `ExtractedDeal` (never throws on sloppy values), then `validateExtraction` decides what
 * is trustworthy enough to pre-fill a form the user reviews. Nothing here publishes anything.
 */

// --- Lenient field parsers ---------------------------------------------------

const lenient = <T>(parse: (value: unknown) => T) => z.unknown().transform(parse);

const EMPTY_TEXT = new Set(["null", "none", "n/a", "na", "undefined", "-", "—"]);

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || EMPTY_TEXT.has(trimmed.toLowerCase()) ? null : trimmed;
}

function singleLine(value: unknown): string | null {
  const t = text(value);
  return t === null ? null : collapseWhitespace(t);
}

function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string") {
    // parseRonPrice reads "1299" as 129, so plain long digit runs are handled here.
    const plain = value.trim().match(/^(\d{4,})(?:[.,](\d{1,2}))?(?!\d|[.,]\d)/);
    if (plain?.[1]) return Number(plain[2] ? `${plain[1]}.${plain[2]}` : plain[1]);
    return parseRonPrice(value) ?? null;
  }
  return null;
}

// Rounded so a stray 19.999 doesn't fail the two-decimals rule of the draft schema.
function money(value: unknown): number | null {
  const n = number(value);
  return n === null ? null : Math.round(n * 100) / 100;
}

function percent(value: unknown): number | null {
  const raw = typeof value === "string" ? Number(value.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".")) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded >= 1 && rounded <= 100 ? rounded : null;
}

// Some models answer 85 instead of 0.85 (2 to 100 is read as a percentage); anything else out of range is clamped.
function confidence(value: unknown): number {
  const raw = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const unit = raw >= 2 && raw <= 100 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, unit));
}

function oneOf<T extends string>(allowed: readonly T[]) {
  return (value: unknown): T | null => {
    const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
    return allowed.find((item) => item === candidate) ?? null;
  };
}

function currency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (code === "LEI" || code === "LEU") return "RON";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function weekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = new Set<number>();
  for (const item of value) {
    const day = typeof item === "string" ? Number(item.trim()) : item;
    if (typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7) days.add(day);
  }
  return days.size === 0 ? null : [...days].sort((a, b) => a - b);
}

function localTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})[:.hH](\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRealDate(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

// A date this far before today, once moved to the current year, means the next year was meant:
// "15 ianuarie" read in December.
const STALE_YEAR_GRACE_DAYS = 31;

/**
 * Posts rarely write the year ("până pe 31 decembrie"), and the model sometimes fills in last
 * year. A year earlier than today's that the source text never states is replaced with the next
 * occurrence of that day and month. A year the post really writes is kept (and then flagged
 * "already_expired").
 */
function correctStaleYear(value: string, now: Date, normalizedSource: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value);
  if (!match) return value;
  const [, yearText, month, day, rest] = match as unknown as [string, string, string, string, string];
  const today = bucharestToday(now);
  const currentYear = Number(today.slice(0, 4));
  if (Number(yearText) >= currentYear || normalizedSource.includes(yearText)) return value;

  for (const year of [currentYear, currentYear + 1]) {
    const date = `${year}-${month}-${day}`;
    if (!isRealDate(date)) continue;
    const daysBehind = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
    if (daysBehind <= STALE_YEAR_GRACE_DAYS) return `${date}${rest}`;
  }
  return value;
}

// Keeps a date-only value, or a datetime with or without an offset, and drops anything else.
function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}) (?=\d)/, "$1T")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const shapeOk = DATE_ONLY.test(cleaned) || LOCAL_DATE_TIME.test(cleaned) || OFFSET_DATE_TIME.test(cleaned);
  return shapeOk && isRealDate(cleaned.slice(0, 10)) ? cleaned : null;
}

// --- Raw model output ----------------------------------------------------------

export const extractedDealSchema = z.object({
  is_deal: z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : v),
    z.boolean(),
  ),
  confidence: lenient(confidence),
  evidence_snippet: lenient(text),
  restaurant_name: lenient(singleLine),
  title: lenient(singleLine),
  description: lenient(text),
  deal_type: lenient(oneOf<DealType>(DEAL_TYPES)),
  deal_price: lenient(money),
  regular_price: lenient(money),
  percent_off: lenient(percent),
  currency: lenient(currency),
  days_of_week: lenient(weekdays),
  time_start: lenient(localTime),
  time_end: lenient(localTime),
  valid_from: lenient(isoDate),
  valid_until: lenient(isoDate),
  channel: lenient(oneOf<DealChannel>(DEAL_CHANNELS)),
  promo_code: lenient(singleLine),
  address: lenient(singleLine),
});

export type ExtractedDeal = z.output<typeof extractedDealSchema>;

const nullable = (type: string, description: string, extra: Record<string, unknown> = {}) => ({
  type: [type, "null"],
  description,
  ...extra,
});

// anyOf rather than a null inside `enum`: it is on the list of keywords Gemini honors.
const nullableEnum = (values: readonly string[], description: string) => ({
  anyOf: [{ type: "string", enum: [...values] }, { type: "null" }],
  description,
});

/** Plain JSON Schema for the same shape, for Gemini's `responseJsonSchema`. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_deal",
    "confidence",
    "evidence_snippet",
    "restaurant_name",
    "title",
    "description",
    "deal_type",
    "deal_price",
    "regular_price",
    "percent_off",
    "currency",
    "days_of_week",
    "time_start",
    "time_end",
    "valid_from",
    "valid_until",
    "channel",
    "promo_code",
    "address",
  ],
  properties: {
    is_deal: {
      type: "boolean",
      description:
        "true only if the content announces one concrete food or drink deal at a restaurant, cafe or bar that a customer can use. false for menus without a deal, ads for other things, or anything unclear.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "How sure you are that the extracted fields are correct, from 0 to 1.",
    },
    evidence_snippet: nullable(
      "string",
      "The exact words copied verbatim, character for character, from the content that state the deal price (for example '2 pizza la 49 lei'). Must contain the deal price. null if the content states no price.",
    ),
    restaurant_name: nullable("string", "Name of the restaurant, cafe or bar offering the deal, as written in the content."),
    title: nullable("string", "Short headline for the deal in the content's language, max 100 characters, for example 'Pizza 1+1 gratis'."),
    description: nullable("string", "What is included and any conditions, in one or two sentences, max 400 characters."),
    deal_type: nullableEnum(
      DEAL_TYPES,
      "bogo = buy one get one / 1+1; percent_off = a percentage discount; combo = a bundle or menu at a set price; fixed_price = one item at a lower price; happy_hour = drinks or food during certain hours; other = anything else.",
    ),
    deal_price: nullable("number", "The price a customer pays under the deal, as a plain number (19.9, not '19,90 lei'). null if not stated."),
    regular_price: nullable("number", "The normal price before the deal, as a plain number. null if not stated."),
    percent_off: nullable("integer", "Discount in percent as an integer from 1 to 100, only if the content states it. null otherwise.", {
      minimum: 1,
      maximum: 100,
    }),
    currency: nullable("string", "ISO 4217 currency code of the prices, usually RON for lei. null if there are no prices."),
    days_of_week: nullable(
      "array",
      "ISO weekdays when the deal applies, 1 = Monday to 7 = Sunday. null if it applies on any day or the days are not stated.",
      { items: { type: "integer", minimum: 1, maximum: 7 } },
    ),
    time_start: nullable("string", "Daily start time in 24-hour HH:MM, Bucharest time. null unless a daily time window is stated."),
    time_end: nullable("string", "Daily end time in 24-hour HH:MM, Bucharest time. null unless a daily time window is stated."),
    valid_from: nullable("string", "First day or moment the deal is valid, as YYYY-MM-DD or an ISO 8601 datetime. null if not stated."),
    valid_until: nullable("string", "Last day or moment the deal is valid, as YYYY-MM-DD or an ISO 8601 datetime. Resolve relative dates using today's date. null if not stated."),
    channel: nullableEnum(
      DEAL_CHANNELS,
      "in_store = at the venue; app_only = only through the venue's own app; delivery = through delivery; promo_code = needs a promo code. null if not stated.",
    ),
    promo_code: nullable("string", "The promo code the customer must enter, if any. null otherwise."),
    address: nullable("string", "Street address of the venue as written in the content. null if not stated."),
  },
} as const;


// --- Evidence matching ---------------------------------------------------------

const QUOTES = /[\u2018\u2019\u201A\u201B\u2032\u00B4\u0060]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g;
const DASHES = /[\u2010-\u2015\u2212]/g;
// Zero-width, bidi and formatting characters: they can hide a delimiter, reorder text or
// split a word so a snippet stops matching. Shared with the web app's prompt preparation.
export const INVISIBLE_CHARS = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/;

/**
 * Canonical form for checking that a snippet occurs in a source text. It applies NFKC (folds
 * NBSP, fullwidth digits, ligatures, "…" to "..."), lowercases, drops soft hyphens and
 * zero-width characters, turns typographic quotes into ' and ", every dash-like character
 * into "-", strips diacritics (so Romanian s-cedilla vs s-comma never breaks a match), and
 * collapses all whitespace to single spaces.
 */
export function normalizeForEvidence(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(new RegExp(INVISIBLE_CHARS, "g"), "")
    .replace(QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

type SnippetPrice = { value: number; currency: string | null; start: number; end: number };

// A digit run is a price only next to a currency marker (see `pricesIn`). A space counts as a
// thousands separator only when the next group is exactly 3 digits.
const NUMBER_TOKEN =
  /(?<!\d)(?:\d{1,3}(?: \d{3})+(?!\d)(?:[.,]\d{1,2})?|\d{1,3}(?:[.,]\d{3})+(?!\d)(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/g;

const CURRENCY_CODES: Record<string, string> = {
  lei: "RON",
  leu: "RON",
  ron: "RON",
  eur: "EUR",
  euro: "EUR",
  "€": "EUR",
  usd: "USD",
  $: "USD",
};

// "19 lei", "19,- lei", "50 de lei", "19 RON". Romanian puts the unit after the number.
const MARKER_AFTER = /^\s*(?:[.,]-|-)?\s*(?:de\s+)?(lei|leu|ron|euro|eur|usd|€|\$)(?![a-z])/;
// "RON 19", "€19", "$ 5". "lei" is left out on purpose: before a number it usually belongs to
// the previous price ("49 lei 1 bere").
const MARKER_BEFORE = /(?:(?<![a-z])(ron|euro|eur|usd)|(€|\$))\s*$/;


/**
 * The prices a snippet states. A number counts only when it sits next to a currency marker,
 * so "30%", "Program 10-22", "17:30-19:00", "0721 999 999", "Valabil 19.10" and "1+1" never
 * vouch for a price. Missing a real price costs the user a few keystrokes; accepting a fake
 * one costs trust.
 */
function pricesIn(snippet: string): SnippetPrice[] {
  const prices: SnippetPrice[] = [];
  for (const match of snippet.matchAll(NUMBER_TOKEN)) {
    const token = match[0];
    const start = match.index;
    const before = snippet.slice(0, start);
    const after = snippet.slice(start + token.length);

    const digits = token.replace(/\D/g, "");
    if (digits.length >= 7) continue;
    if (/^\s*%/.test(after) || before.endsWith(":") || after.startsWith(":")) continue;
    if (before.endsWith("+") || after.startsWith("+") || /\d\s?-\s?$/.test(before)) continue;

    const markerMatch = MARKER_AFTER.exec(after);
    const markerAfter = markerMatch?.[1];
    if (token.includes(" ") && !markerAfter) continue;
    // "19.10" alone reads as a date, "19.10 lei" or "RON 19.10" as a price.
    const markerBefore = markerAfter ? null : MARKER_BEFORE.exec(before);
    const marker = markerAfter ?? markerBefore?.slice(1).find(Boolean);
    if (!marker) continue;

    const parts = token.match(/^(.*?)(?:[.,](\d{1,2}))?$/);
    if (!parts?.[1]) continue;
    const whole = parts[1].replace(/[ .,]/g, "");
    prices.push({
      value: Number(parts[2] ? `${whole}.${parts[2]}` : whole),
      currency: CURRENCY_CODES[marker] ?? null,
      // The span covers the currency marker on either side, so "în loc de RON 39" leaves only
      // the cue in the gap.
      start: start - (markerBefore?.[0].length ?? 0),
      end: start + token.length + (markerMatch?.[0].length ?? 0),
    });
  }
  return prices;
}

// What may stand between a deal price and the regular price after it: "25 lei în loc de 39 lei",
// "25 lei (preț normal 39 lei)". Compared after `betweenWords`, on normalized text.
const DEAL_THEN_REGULAR = new Set([
  "in loc de",
  "fata de",
  "instead of",
  "pret vechi",
  "pretul vechi",
  "pret normal",
  "pretul normal",
  "pret intreg",
  "pret initial",
  "pret de lista",
  "pret regular",
  // Not bare "inainte": "25 lei înainte, 39 lei la livrare" means paying in advance.
  "inainte era",
  "was",
  "normally",
  "originally",
  "regular price",
]);
// What may stand between a regular price and the deal price after it, when the regular one is
// introduced by REGULAR_OPENER: "redus de la 39 lei la 25 lei", "înainte 39 lei, acum 25 lei".
const REGULAR_THEN_DEAL = new Set(["la", "acum", "acum doar", "acum la", "doar", "now", "now only", "only"]);
const REGULAR_OPENER =
  /(?:^|[^a-z])(?:redus[a]? de la|reducere de la|in loc de|instead of|inainte|pret(?:ul)? (?:vechi|normal|intreg|initial)|was|price before)\s*:?\s*$/;
// "25 lei, 39 lei înainte": a closing tag right after the regular price, then punctuation or the end.
const REGULAR_CLOSER = /^\s*\(?\s*(?:inainte|pret(?:ul)? (?:vechi|normal|intreg|initial))\s*\)?\s*(?:[.,;!]|$)/;
// Not a lone ">": "Pizza mare 39 lei > 25 lei pizza mica" is a separator.
const ARROW = /^\s*(?:->|=>|→)\s*$/;
// A pair never spans a sentence: "Burger 25 lei! Preț normal: 39 lei pentru meniul XXL".
const SENTENCE_BREAK = /[.!?;]/;

function betweenWords(text: string): string {
  return text.replace(/[,:()[\]"']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Two prices are a deal and its regular price only when the text pairs them: they sit next to
 * each other with nothing between but a contrast phrase. Judging each price on its own let
 * "Supa 12 lei, Ciorba 15 lei în loc de 20 lei" or "Meniu 45 lei înainte de ora 12" pass as
 * discounts. Anything looser is dropped and the user types the regular price in the form.
 *
 * `text` is the normalized source with price spans located in it, not the snippet: the model
 * picks the snippet's edges, so an opener or closer read from the snippet could be a cut-off
 * "inainte de 1 noiembrie".
 */
function isPricePair(text: string, deal: SnippetPrice, regular: SnippetPrice): boolean {
  if (deal.currency !== null && regular.currency !== null && deal.currency !== regular.currency) return false;
  if (deal.end <= regular.start) {
    const between = text.slice(deal.end, regular.start);
    if (SENTENCE_BREAK.test(between)) return false;
    const gap = betweenWords(between);
    if (DEAL_THEN_REGULAR.has(gap)) return true;
    // "acum 25 lei, înainte 39 lei": "înainte" right before the regular price, not before the comma.
    if (/^\s*,?\s*inainte\s*:?\s*$/.test(between)) return true;
    return gap === "" && REGULAR_CLOSER.test(text.slice(regular.end));
  }
  if (regular.end <= deal.start) {
    const between = text.slice(regular.end, deal.start);
    if (SENTENCE_BREAK.test(between)) return false;
    if (ARROW.test(between)) return true;
    const opened = REGULAR_OPENER.test(text.slice(Math.max(0, regular.start - 30), regular.start));
    return opened && REGULAR_THEN_DEAL.has(betweenWords(between));
  }
  return false;
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * Where the snippet occurs in the source without cutting a word or number in half, or -1.
 * "9 lei la pizza" inside "29 lei la pizza" and "ron 12" inside "macaron 12" don't count.
 */
function boundedOccurrence(source: string, snippet: string): number {
  const first = snippet.charAt(0);
  const last = snippet.charAt(snippet.length - 1);
  for (let at = source.indexOf(snippet); at !== -1; at = source.indexOf(snippet, at + 1)) {
    const cutStart = WORD_CHAR.test(first) && WORD_CHAR.test(source.charAt(at - 1));
    const cutEnd = WORD_CHAR.test(last) && WORD_CHAR.test(source.charAt(at + snippet.length));
    if (!cutStart && !cutEnd) return at;
  }
  return -1;
}

// Only a number written with a percent sign may vouch for a percentage.
function percentagesIn(snippet: string): number[] {
  return [...snippet.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((m) => Math.round(Number(m[1]?.replace(",", "."))));
}

const MIN_EVIDENCE_LENGTH = 4;
const MAX_EVIDENCE_LENGTH = 200;

// --- Validation -----------------------------------------------------------------

export type ExtractionWarning =
  | "invalid_output"
  | "not_a_deal"
  | "evidence_missing"
  | "evidence_not_found"
  | "evidence_too_long"
  | "price_not_in_evidence"
  | "regular_price_unanchored"
  | "not_a_discount"
  | "percent_mismatch"
  | "currency_mismatch"
  | "expiry_defaulted"
  | "expiry_clamped"
  | "already_expired"
  | "year_corrected"
  | `invalid_field:${keyof ExtractionDraft}`;

/**
 * Every field is present. `restaurantName` and `title` are null when the model did not find
 * them: the form must require them, everything else already satisfies `dealDraftSchema`.
 * `dealType` and `channel` have no null in the schema, so unknown values fall back to
 * "other" and "in_store", and the user can change them in the form.
 */
export type ExtractionDraft = Omit<DealDraftInput, "restaurantName" | "title"> & {
  restaurantName: string | null;
  title: string | null;
  description: string | null;
  dealPrice: number | null;
  regularPrice: number | null;
  percentOff: number | null;
  currency: string;
  daysOfWeek: number[] | null;
  timeStart: string | null;
  timeEnd: string | null;
  validFrom: string | null;
  validUntil: string | null;
  promoCode: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
};

export type ExtractionResult = {
  isDeal: boolean;
  /** After adjustments: capped at 0.3 when a price fails the evidence check, 0 for invalid output. */
  confidence: number;
  draft: ExtractionDraft;
  evidenceSnippet: string | null;
  /** null for image sources, where the check is skipped. */
  evidenceVerified: boolean | null;
  imageSourced: boolean;
  priceDiscarded: boolean;
  notADiscount: boolean;
  expiryDefaulted: boolean;
  warnings: ExtractionWarning[];
};

export type ExtractionContext = {
  source: "text" | "image";
  /** Exactly the text the model saw. For images it is ignored: nothing can be checked against pixels. */
  sourceText?: string;
  now: Date;
};

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 90;
const UNVERIFIED_CONFIDENCE_CAP = 0.3;
const PERCENT_TOLERANCE = 2;

/**
 * End of a local day is 23:59:59 in Europe/Bucharest, expressed as a UTC instant, so a deal
 * "until Friday" stays valid through Friday night, in summer and winter time alike.
 */
function endOfBucharestDay(date: string): string | undefined {
  const iso = bucharestLocalToIso(date, "23:59");
  return iso === undefined ? undefined : new Date(Date.parse(iso) + 59_000).toISOString();
}

function toIso(value: string, edge: "start" | "end"): string | undefined {
  if (DATE_ONLY.test(value)) {
    return edge === "start" ? bucharestLocalToIso(value, "00:00") : endOfBucharestDay(value);
  }
  // No offset means the model wrote a local time; the post is about Bucharest.
  const local = value.match(LOCAL_DATE_TIME);
  if (local?.[1] && local[2]) return bucharestLocalToIso(local[1], local[2]);
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

// Counted in calendar days, not 24-hour blocks, so a DST change in between cannot shift the date.
function endOfBucharestDayAfter(base: Date, days: number): string {
  const [y, m, d] = bucharestToday(base).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return endOfBucharestDay(target) ?? new Date(base.getTime() + days * 86_400_000).toISOString();
}

function defaultExpiry(now: Date, validFrom: string | null): string {
  const from = validFrom === null ? undefined : Date.parse(validFrom);
  return endOfBucharestDayAfter(from !== undefined && from > now.getTime() ? new Date(from) : now, DEFAULT_EXPIRY_DAYS);
}

function emptyDraft(): ExtractionDraft {
  return {
    restaurantName: null,
    title: null,
    description: null,
    dealType: "other",
    dealPrice: null,
    regularPrice: null,
    percentOff: null,
    currency: "RON",
    daysOfWeek: null,
    timeStart: null,
    timeEnd: null,
    validFrom: null,
    validUntil: null,
    channel: "in_store",
    promoCode: null,
    address: null,
    lat: null,
    lon: null,
  };
}

const PLACEHOLDER_NAME = "placeholder";

/**
 * Checks the draft against `dealDraftSchema` and nulls the fields it rejects, one at a time,
 * so a single bad length or time never costs the user the rest of the pre-fill.
 */
function enforceDraftSchema(draft: ExtractionDraft, warn: (code: ExtractionWarning) => void): ExtractionDraft {
  const current = { ...draft };
  const drop = (field: keyof ExtractionDraft) => {
    switch (field) {
      case "dealType":
        current.dealType = "other";
        break;
      case "channel":
        current.channel = "in_store";
        break;
      case "currency":
        current.currency = "RON";
        break;
      default:
        (current as Record<string, unknown>)[field] = null;
    }
    warn(`invalid_field:${field}`);
  };

  for (let attempt = 0; attempt < 12; attempt++) {
    const parsed = dealDraftSchema.safeParse({
      ...current,
      restaurantName: current.restaurantName ?? PLACEHOLDER_NAME,
      title: current.title ?? PLACEHOLDER_NAME,
    });
    if (parsed.success) break;
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ExtractionDraft | undefined;
      if (field === "timeStart" || field === "timeEnd") {
        drop("timeStart");
        drop("timeEnd");
      } else if (field === "validUntil" && issue.code === "custom") {
        drop("validFrom");
      } else if (field === "lat" || field === "lon") {
        drop("lat");
        drop("lon");
      } else if (field) {
        drop(field);
      }
    }
  }
  return current;
}

function invalidOutput(source: ExtractionContext["source"], now: Date): ExtractionResult {
  const draft = emptyDraft();
  draft.validUntil = defaultExpiry(now, null);
  return {
    isDeal: false,
    confidence: 0,
    draft,
    evidenceSnippet: null,
    evidenceVerified: source === "image" ? null : false,
    imageSourced: source === "image",
    priceDiscarded: false,
    notADiscount: false,
    expiryDefaulted: true,
    warnings: ["invalid_output", "expiry_defaulted"],
  };
}

/**
 * Turns raw model output into a draft that is safe to pre-fill. Never throws.
 *
 * Price trust (text sources): the snippet the model quotes must occur in the source text
 * (after `normalizeForEvidence`), be at most 200 characters, and each price must appear in it
 * as a number next to a currency marker (lei, RON, EUR, €, ...; see `pricesIn`).
 * - Snippet missing, too long or not found: all price fields are discarded and confidence is
 *   capped. This applies only when the model returned a price field; a priceless deal keeps
 *   its confidence and gets no evidence warning.
 * - dealPrice not in the snippet: all price fields are discarded, because a wrong deal
 *   price taints the rest.
 * - regularPrice not in the snippet: only that field is discarded.
 * - percentOff counts as evidenced only if the snippet writes it with a percent sign.
 * This check proves the numbers occur in the page, not that they belong to this deal: a page
 * that plants a convincing snippet passes it. Human review is the defense, so the form always
 * shows the snippet next to the prices.
 * Image sources skip the check (nothing to compare against) and keep the prices; the
 * `imageSourced` flag lets the form ask the user to double-check them.
 *
 * Price coherence: dealPrice >= regularPrice sets `notADiscount`, keeps both prices so the
 * user sees them, and always drops percentOff. When two prices are present and it is a
 * discount, percentOff is computed from them whatever the model said, and a stated percentage
 * more than 2 points off raises "percent_mismatch".
 *
 * Currency: a clear marker in the snippet (lei/ron, eur/€, usd/$) overrides the model's
 * currency, with "currency_mismatch" if the model said otherwise.
 *
 * Dates: a date-only valid_from is the start of that day and a date-only valid_until is
 * 23:59:59 of that day, both in Europe/Bucharest. A datetime without an offset is read as
 * Bucharest local time. A missing validUntil becomes the end of the Bucharest day seven days
 * from now (or from validFrom, if that is later), with `expiryDefaulted` set. A stated
 * validUntil more than 90 days out is clamped to the end of the Bucharest day 90 days from
 * now ("expiry_clamped"). A validUntil in the past is kept with "already_expired". An invalid
 * `now` falls back to the current time.
 */
export function validateExtraction(raw: unknown, ctx: ExtractionContext): ExtractionResult {
  const now = ctx.now instanceof Date && !Number.isNaN(ctx.now.getTime()) ? ctx.now : new Date();
  const unwrapped = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  const parsed = extractedDealSchema.safeParse(unwrapped);
  if (!parsed.success) return invalidOutput(ctx.source, now);
  const extracted = parsed.data;

  const warnings: ExtractionWarning[] = [];
  const warn = (code: ExtractionWarning) => {
    if (!warnings.includes(code)) warnings.push(code);
  };

  const draft: ExtractionDraft = {
    ...emptyDraft(),
    restaurantName: extracted.restaurant_name,
    title: extracted.title,
    description: extracted.description,
    dealType: extracted.deal_type ?? "other",
    dealPrice: extracted.deal_price,
    regularPrice: extracted.regular_price,
    percentOff: extracted.percent_off,
    currency: extracted.currency ?? "RON",
    daysOfWeek: extracted.days_of_week,
    timeStart: extracted.time_start,
    timeEnd: extracted.time_end,
    promoCode: extracted.promo_code,
    address: extracted.address,
    channel: extracted.channel ?? "in_store",
  };
  let confidenceValue = extracted.confidence;
  let priceDiscarded = false;
  let percentDropped = false;
  let evidenceVerified: boolean | null = null;
  const imageSourced = ctx.source === "image";

  if (!extracted.is_deal) warn("not_a_deal");

  const hasPrices = () => draft.dealPrice !== null || draft.regularPrice !== null || draft.percentOff !== null;
  const discardPrices = () => {
    if (hasPrices()) priceDiscarded = true;
    draft.dealPrice = null;
    draft.regularPrice = null;
    draft.percentOff = null;
  };

  if (!imageSourced) {
    const hadPrices = hasPrices();
    const snippet = extracted.evidence_snippet === null ? "" : normalizeForEvidence(extracted.evidence_snippet);
    const source = normalizeForEvidence(ctx.sourceText ?? "");

    let failure: "evidence_missing" | "evidence_too_long" | "evidence_not_found" | null = null;
    if (extracted.evidence_snippet === null || snippet.length < MIN_EVIDENCE_LENGTH) failure = "evidence_missing";
    else if (snippet.length > MAX_EVIDENCE_LENGTH) failure = "evidence_too_long";
    const offset = failure === null ? boundedOccurrence(source, snippet) : -1;
    if (failure === null && offset === -1) failure = "evidence_not_found";
    evidenceVerified = failure === null;

    if (failure !== null) {
      if (hadPrices) {
        warn(failure);
        discardPrices();
        confidenceValue = Math.min(confidenceValue, UNVERIFIED_CONFIDENCE_CAP);
      }
    } else {
      // Prices are read from the source, not the snippet: the model picks the snippet's edges,
      // and "9 lei" cut out of "29 lei" must not count as a price the page states.
      const prices = pricesIn(source).filter((p) => p.start >= offset && p.end <= offset + snippet.length);
      const hasPrice = (value: number) => prices.some((p) => Math.abs(p.value - value) < 0.005);

      if (draft.dealPrice !== null && !hasPrice(draft.dealPrice)) {
        discardPrices();
        warn("price_not_in_evidence");
      } else {
        if (draft.regularPrice !== null && !hasPrice(draft.regularPrice)) {
          draft.regularPrice = null;
          priceDiscarded = true;
          warn("price_not_in_evidence");
        } else if (draft.regularPrice !== null) {
          const at = (value: number | null) => prices.filter((p) => value !== null && Math.abs(p.value - value) < 0.005);
          const deals = at(draft.dealPrice);
          const regulars = at(draft.regularPrice);
          if (!deals.some((d) => regulars.some((r) => r.start !== d.start && isPricePair(source, d, r)))) {
            draft.regularPrice = null;
            priceDiscarded = true;
            warn("regular_price_unanchored");
          }
        }
        if (draft.percentOff !== null && !percentagesIn(snippet).includes(draft.percentOff)) {
          draft.percentOff = null;
          percentDropped = true;
          warn("price_not_in_evidence");
        }
      }

      const currencies = new Set(prices.map((p) => p.currency).filter((c): c is string => c !== null));
      const [stated] = [...currencies];
      if (currencies.size === 1 && stated !== undefined && stated !== draft.currency) {
        if (extracted.currency !== null) warn("currency_mismatch");
        draft.currency = stated;
      }
    }
  }

  const notADiscount =
    draft.dealPrice !== null && draft.regularPrice !== null && draft.regularPrice > 0 && draft.dealPrice >= draft.regularPrice;
  if (notADiscount) {
    warn("not_a_discount");
    draft.percentOff = null;
  } else if (draft.dealPrice !== null && draft.regularPrice !== null && draft.regularPrice > 0) {
    const stated = extracted.percent_off;
    const derived = discountPercent(draft.dealPrice, draft.regularPrice);
    draft.percentOff = derived !== undefined && derived >= 1 ? derived : null;
    if (stated !== null && Math.abs((derived ?? 0) - stated) > PERCENT_TOLERANCE) warn("percent_mismatch");
  }
  if (percentDropped && draft.percentOff === null) priceDiscarded = true;

  const datedText = normalizeForEvidence(ctx.sourceText ?? "");
  const currentYear = (value: string | null) => {
    if (value === null) return null;
    const fixed = correctStaleYear(value, now, datedText);
    if (fixed !== value) warn("year_corrected");
    return fixed;
  };
  const validFrom = currentYear(extracted.valid_from);
  const validUntil = currentYear(extracted.valid_until);
  if (validFrom !== null) draft.validFrom = toIso(validFrom, "start") ?? null;
  if (validUntil !== null) draft.validUntil = toIso(validUntil, "end") ?? null;

  let expiryDefaulted = false;
  if (draft.validUntil === null) {
    draft.validUntil = defaultExpiry(now, draft.validFrom);
    expiryDefaulted = true;
    warn("expiry_defaulted");
  } else {
    // Count from a future start date, so the clamp never lands before validFrom.
    const from = draft.validFrom !== null && Date.parse(draft.validFrom) > now.getTime() ? new Date(draft.validFrom) : now;
    const limit = endOfBucharestDayAfter(from, MAX_EXPIRY_DAYS);
    if (Date.parse(draft.validUntil) > Date.parse(limit)) {
      draft.validUntil = limit;
      warn("expiry_clamped");
    } else if (Date.parse(draft.validUntil) < now.getTime()) {
      warn("already_expired");
    }
  }

  const checked = enforceDraftSchema(draft, warn);

  return {
    isDeal: extracted.is_deal,
    confidence: confidenceValue,
    draft: checked,
    evidenceSnippet: extracted.evidence_snippet,
    evidenceVerified,
    imageSourced,
    priceDiscarded,
    notADiscount,
    expiryDefaulted,
    warnings,
  };
}
