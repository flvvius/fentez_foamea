import { normalizeSourceUrl } from "@fentezfoamea/core";

export const MAX_URL_LENGTH = 2048;

export type SourceLink = {
  /** What we store and show as the link: the user's URL without credentials or fragment. */
  sourceUrl: string;
  /** The dedup key (source_url_normalized). */
  normalized: string;
};

/** null when the input is too long, not http(s), or unparsable. */
export function parseSourceLink(input: string): SourceLink | null {
  if (input.length > MAX_URL_LENGTH) return null;
  const normalized = normalizeSourceUrl(input);
  if (normalized === null) return null;
  const url = new URL(input.trim());
  url.username = "";
  url.password = "";
  url.hash = "";
  return { sourceUrl: url.href, normalized };
}
