import { bucharestLocalToIso, bucharestToday, discountPercent, type DealDraft } from "@fentezfoamea/core";

export const DEFAULT_EXPIRY_DAYS = 7;
export const MAX_EXPIRY_DAYS = 90;
const DAY_MS = 86_400_000;

// Dates outside this range are rejected before they reach Postgres, whatever computed them.
const MIN_DATE_MS = Date.UTC(1970, 0, 1);
const MAX_DATE_MS = Date.UTC(2100, 0, 1);

export function isPlausibleInstant(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_DATE_MS && ms < MAX_DATE_MS;
}

/**
 * The end of the Bucharest day `days` calendar days after `base`, as an ISO instant. Core's
 * helper of the same name (extraction.ts) is not exported, so this repeats its rule: counted
 * in calendar days, so a DST change in between cannot shift the date, and valid through
 * 23:59:59 local time.
 */
export function endOfBucharestDayAfter(base: Date, days: number): string {
  const [y, m, d] = bucharestToday(base).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  const iso = bucharestLocalToIso(target, "23:59");
  return iso === undefined
    ? new Date(base.getTime() + days * DAY_MS).toISOString()
    : new Date(Date.parse(iso) + 59_000).toISOString();
}

// The start of the deal when it is still ahead, otherwise now: expiry is counted from there,
// so it can never land before validFrom.
function expiryBase(now: Date, validFrom: string | null): Date {
  const from = validFrom === null ? Number.NaN : Date.parse(validFrom);
  return from > now.getTime() ? new Date(from) : now;
}

/** A week after `now` (or after `validFrom` when that is still ahead), end of the Bucharest day. */
export function defaultValidUntil(now: Date, validFrom: string | null = null): string {
  return endOfBucharestDayAfter(expiryBase(now, validFrom), DEFAULT_EXPIRY_DAYS);
}

/**
 * The latest expiry we accept: 90 days after max(now, validFrom), the same limit core applies
 * to extracted deals. Without it a deal could hold its source url (see findDuplicateDeal) for ever.
 */
export function latestValidUntil(now: Date, validFrom: string | null): string {
  return endOfBucharestDayAfter(expiryBase(now, validFrom), MAX_EXPIRY_DAYS);
}

/** validFrom is refused when it is further ahead than this. */
export function latestValidFrom(now: Date): number {
  return now.getTime() + MAX_EXPIRY_DAYS * DAY_MS;
}

/**
 * Derives the price fields the client is not trusted with. A deal price at or above the
 * regular price is not a discount: both prices stay (the card shows them), the percentage is
 * dropped. Otherwise a percentage computed from the two prices replaces whatever was sent,
 * the same rule core applies to extraction results.
 */
export function computePriceFields(
  draft: Pick<DealDraft, "dealPrice" | "regularPrice" | "percentOff">,
): { notADiscount: boolean; percentOff: number | null } {
  const { dealPrice, regularPrice } = draft;
  if (dealPrice === null || regularPrice === null) return { notADiscount: false, percentOff: draft.percentOff };
  if (dealPrice >= regularPrice) return { notADiscount: true, percentOff: null };
  const derived = discountPercent(dealPrice, regularPrice);
  return { notADiscount: false, percentOff: derived !== undefined && derived >= 1 ? derived : null };
}
