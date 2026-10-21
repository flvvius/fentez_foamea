export function parseRonPrice(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.replace(/\s/g, "").match(/(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?/);
  if (!match?.[1]) return undefined;
  const whole = Number(match[1].replace(/[.,]/g, ""));
  const fraction = match[2] ? Number(match[2].padEnd(2, "0")) / 100 : 0;
  const value = whole + fraction;
  return Number.isFinite(value) ? value : undefined;
}

export function fromMinorUnits(amount: number | null | undefined): number | undefined {
  return typeof amount === "number" ? Math.round(amount) / 100 : undefined;
}

export function discountPercent(price?: number, originalPrice?: number): number | undefined {
  if (price === undefined || !originalPrice || originalPrice <= price) return undefined;
  return Math.round((1 - price / originalPrice) * 100);
}

export function isGenuineDiscount(price?: number, originalPrice?: number, minPercent = 10): boolean {
  const pct = discountPercent(price, originalPrice);
  return pct !== undefined && pct >= minPercent;
}
