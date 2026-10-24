import { DEAL_TYPE_LABELS, WEEKDAY_SHORT } from "@fentezfoamea/core";
import { formatPrice } from "@/lib/format";
import type { DealCard } from "@/server/deals/types";

const TZ = "Europe/Bucharest";
const dateFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, day: "numeric", month: "short" });

export function currencyUnit(currency: string): string {
  return currency === "RON" ? "lei" : currency;
}

export type PriceFigureModel = {
  /** The big number, e.g. "25". null when the deal has no price (the type label is shown instead). */
  price: string | null;
  unit: string;
  /** Label shown in place of the price. */
  fallbackLabel: string;
  /** The regular price, only when the deal really is cheaper. */
  was: string | null;
  /** "−30%", only for a real discount with a percentage. */
  off: string | null;
  /** True: show the muted "nu e reducere" text and never a percentage. */
  notADiscount: boolean;
};

type PriceFields = Pick<DealCard, "dealPrice" | "regularPrice" | "percentOff" | "currency" | "notADiscount" | "dealType">;

/**
 * Display rules for the price column. A deal flagged notADiscount never shows a percentage or
 * a struck-through regular price: the price is not lower, so crossing it out would mislead.
 */
export function priceFigure(deal: PriceFields): PriceFigureModel {
  const unit = currencyUnit(deal.currency);
  return {
    price: deal.dealPrice === null ? null : formatPrice(deal.dealPrice),
    unit,
    fallbackLabel: DEAL_TYPE_LABELS[deal.dealType],
    was: !deal.notADiscount && deal.regularPrice !== null ? formatPrice(deal.regularPrice) : null,
    off: !deal.notADiscount && deal.percentOff !== null ? `−${deal.percentOff}%` : null,
    notADiscount: deal.notADiscount,
  };
}

export function isOvernight(timeStart: string | null, timeEnd: string | null): boolean {
  return timeStart !== null && timeEnd !== null && timeStart > timeEnd;
}

const WEEKDAY_FULL = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

function formatDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  // A lone "J" is cryptic; one day reads better spelled out.
  if (sorted.length === 1) return WEEKDAY_FULL[sorted[0]! - 1]!;
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1]! + 1);
  if (contiguous && sorted.length > 2) return `${WEEKDAY_SHORT[sorted[0]! - 1]}–${WEEKDAY_SHORT[sorted.at(-1)! - 1]}`;
  return sorted.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
}

/**
 * "L–V, 12:00–15:00". A window that crosses midnight (22:00–02:00) says so. Null when the
 * deal runs every day with no time window.
 */
export function formatSchedule(deal: Pick<DealCard, "daysOfWeek" | "timeStart" | "timeEnd">): string | null {
  const days = deal.daysOfWeek && deal.daysOfWeek.length > 0 && deal.daysOfWeek.length < 7 ? formatDays(deal.daysOfWeek) : null;
  const hours =
    deal.timeStart && deal.timeEnd
      ? `${deal.timeStart}–${deal.timeEnd}${isOvernight(deal.timeStart, deal.timeEnd) ? " (peste noapte)" : ""}`
      : null;
  if (!days && !hours) return null;
  return [days, hours].filter(Boolean).join(", ");
}

const yearFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, year: "numeric" });

/** "29 oct.", with the year when it isn't the current one ("15 ian. 2027"), so a wrong year never hides. */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameYear = yearFormat.format(date) === yearFormat.format(now);
  return sameYear ? dateFormat.format(date) : `${dateFormat.format(date)} ${yearFormat.format(date)}`;
}

/** "Valabilă 1 nov. – 15 dec.", or "Valabilă până pe 15 dec." when the deal has no start date. */
export function formatValidity(deal: Pick<DealCard, "validFrom" | "validUntil">, now: Date): string {
  const until = formatShortDate(deal.validUntil, now);
  return deal.validFrom ? `Valabilă ${formatShortDate(deal.validFrom, now)} – ${until}` : `Valabilă până pe ${until}`;
}

/** The host to label a source link with, or null when the url is not a plain http(s) link. */
export function sourceHost(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Same rule the server applies: a deal price at or above the regular price is not a discount. */
export function isNotADiscount(dealPrice: number | null, regularPrice: number | null): boolean {
  return dealPrice !== null && regularPrice !== null && dealPrice >= regularPrice;
}
