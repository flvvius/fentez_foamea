import { INVISIBLE_CHARS } from "@fentezfoamea/core";

export const MAX_TEXT_CHARS = 12_000;

/**
 * The exact text the model gets to see for a piece of untrusted content, and the text the
 * evidence check must run against. NFKC folds fullwidth look-alikes (＜＜＜) into ASCII, invisible
 * characters are dropped, and any run of three or more angle brackets is neutralized, so the
 * content cannot forge a "<<<" or ">>>" marker. The result is cut to 12,000 characters without
 * splitting a surrogate pair. Applying it twice changes nothing.
 */
export function prepareContentText(text: string): string {
  const cleaned = text
    .normalize("NFKC")
    .replace(new RegExp(INVISIBLE_CHARS, "g"), "")
    .replace(/[<>]{3,}/g, "[removed]")
    .normalize("NFKC");
  if (cleaned.length <= MAX_TEXT_CHARS) return cleaned;
  const cut = cleaned.slice(0, MAX_TEXT_CHARS);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
