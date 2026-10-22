import { Readability } from "@mozilla/readability";
import { collapseWhitespace } from "@fentezfoamea/core";
import { Parser } from "htmlparser2";
import { parseHTML } from "linkedom";
import { FetchFailedError, UnsafeUrlError, safeFetch } from "../net/safe-fetch.ts";

export type SourceContent =
  | {
      kind: "text";
      platform: "web" | "tiktok";
      url: string;
      finalUrl: string;
      title: string | null;
      text: string;
      postedAt: string | null;
      imageUrl: string | null;
    }
  | {
      kind: "needs_screenshot";
      url: string;
      reason: "instagram" | "unsupported_platform" | "fetch_failed" | "unsupported_content" | "empty";
    };

type NeedsScreenshot = Extract<SourceContent, { kind: "needs_screenshot" }>;
type TextContent = Extract<SourceContent, { kind: "text" }>;

const MAX_TEXT_CHARS = 12_000;
const MIN_TEXT_CHARS = 40;
const DAY_MS = 86_400_000;
// TikTok started in 2016; anything earlier decoded from a video id is noise.
const TIKTOK_EPOCH_MS = Date.UTC(2016, 0, 1);
// Readability and linkedom are super-linear on deeply nested markup and run synchronously, past
// any fetch timeout, so hostile pages are bounded before they ever reach a DOM.
const MAX_HTML_CHARS = 500_000;
const MAX_NESTING_DEPTH = 150;
// Readability's work grows with depth × element count (148 deep with 20k paragraphs took
// 3.5 s), and its own maxElemsToParse never fires under linkedom, whose
// getElementsByTagName("*") returns nothing. Pages over this budget use the measured text.
const READABILITY_BUDGET = 150_000;
// Wide pages cost real time too (500 KB of <p> took over a second end to end).
const MAX_ELEMENTS_FOR_DOM = 20_000;
const TIKTOK_DEADLINE_MS = 8000;
const WEB_ACCEPT = ["text/html", "application/xhtml+xml", "text/plain"];

const INSTAGRAM_HOSTS = ["instagram.com", "instagr.am"];
const FACEBOOK_HOSTS = ["facebook.com", "fb.com", "fb.watch"];
const TIKTOK_HOSTS = ["tiktok.com"];

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  let end = MAX_TEXT_CHARS;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return text.slice(0, end).trimEnd();
}

function needsScreenshot(url: string, reason: NeedsScreenshot["reason"]): NeedsScreenshot {
  return { kind: "needs_screenshot", url, reason };
}

function httpUrl(value: string | null | undefined, base: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function toIso(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime() + DAY_MS) return null;
  return date.toISOString();
}

function classifyFetchError(error: unknown): NeedsScreenshot["reason"] {
  if (error instanceof FetchFailedError && error.code === "bad_content_type") return "unsupported_content";
  return "fetch_failed";
}

function charsetFromContentType(contentType: string): string | null {
  return /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType)?.[1] ?? null;
}

// Only ASCII-compatible charsets are supported; UTF-16/32 and the stateful legacy encodings
// (TextDecoder reports them as "replacement") return null so the caller can ask for a screenshot.
const UNSUPPORTED_ENCODINGS = new Set(["utf-16le", "utf-16be", "replacement", "iso-2022-jp"]);

function decode(body: Buffer, contentType: string, sniffMeta: boolean): string | null {
  if ((body[0] === 0xff && body[1] === 0xfe) || (body[0] === 0xfe && body[1] === 0xff)) return null;
  let charset = charsetFromContentType(contentType);
  if (!charset && sniffMeta) {
    const head = body.subarray(0, 4096).toString("latin1");
    charset =
      /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1] ??
      /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w.:-]+)/i.exec(head)?.[1] ??
      null;
  }
  if (charset && /^(?:utf-?(?:16|32)|ucs-?[24])/i.test(charset)) return null;
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset ?? "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  if (UNSUPPORTED_ENCODINGS.has(decoder.encoding)) return null;
  return decoder.decode(body);
}

// ---------- TikTok ----------

function videoIdFromUrl(url: string): string | null {
  try {
    return /\/video\/(\d{8,20})(?:\/|$)/.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

// A TikTok video id is a snowflake whose top 32 bits are the Unix creation time.
function postedAtFromVideoId(id: string | null, now: Date): string | null {
  if (!id || !/^\d{8,20}$/.test(id)) return null;
  const ms = Number(BigInt(id) >> 32n) * 1000;
  if (ms < TIKTOK_EPOCH_MS || ms > now.getTime() + DAY_MS) return null;
  return new Date(ms).toISOString();
}

type Fetcher = typeof safeFetch;

async function tiktokOembed(canonicalUrl: string, fetcher: Fetcher, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
  try {
    const res = await fetcher(endpoint, { accept: ["application/json"], maxBytes: 200_000, timeoutMs });
    const parsed: unknown = JSON.parse(res.body.toString("utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    return null;
  }
}

async function loadTiktok(url: string, fetcher: Fetcher, now: Date): Promise<SourceContent> {
  // One budget for the whole oEmbed / short-link / retry sequence, not per request.
  const deadline = Date.now() + TIKTOK_DEADLINE_MS;
  const remaining = () => deadline - Date.now();
  let canonical = url;
  if (remaining() <= 0) return needsScreenshot(url, "fetch_failed");
  let oembed = await tiktokOembed(canonical, fetcher, remaining());

  if (!oembed) {
    // vm./vt. short links are not always understood by oEmbed; resolve them to the canonical URL.
    let resolved: string;
    if (remaining() <= 0) return needsScreenshot(url, "fetch_failed");
    try {
      resolved = (await fetcher(url, { accept: ["text/html", "application/xhtml+xml", "text/plain"], maxBytes: 500_000, timeoutMs: remaining() })).url;
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw error;
      return needsScreenshot(url, "fetch_failed");
    }
    let final: URL;
    try {
      final = new URL(resolved);
    } catch {
      return needsScreenshot(url, "fetch_failed");
    }
    if (!hostMatches(final.hostname, TIKTOK_HOSTS)) return needsScreenshot(url, "fetch_failed");
    final.search = "";
    final.hash = "";
    if (final.href === url) return needsScreenshot(url, "fetch_failed");
    canonical = final.href;
    if (remaining() <= 0) return needsScreenshot(url, "fetch_failed");
    oembed = await tiktokOembed(canonical, fetcher, remaining());
    if (!oembed) return needsScreenshot(url, "fetch_failed");
  }

  const caption = typeof oembed.title === "string" ? collapseWhitespace(oembed.title) : "";
  if (!caption) return needsScreenshot(url, "empty");
  const author = typeof oembed.author_name === "string" ? collapseWhitespace(oembed.author_name) : "";

  const idCandidates = [
    videoIdFromUrl(canonical),
    videoIdFromUrl(url),
    typeof oembed.embed_product_id === "string" ? oembed.embed_product_id : null,
    typeof oembed.html === "string" ? (/data-video-id="(\d+)"/.exec(oembed.html)?.[1] ?? null) : null,
  ];
  const postedAt = idCandidates.map((id) => postedAtFromVideoId(id, now)).find((value) => value !== null) ?? null;

  const text = collapseWhitespace(author ? `${caption} Autor: ${author}` : caption);
  return {
    kind: "text",
    platform: "tiktok",
    url,
    finalUrl: canonical,
    title: caption.length > 120 ? `${caption.slice(0, 120).trimEnd()}…` : caption,
    text: truncate(text),
    postedAt,
    imageUrl: httpUrl(typeof oembed.thumbnail_url === "string" ? oembed.thumbnail_url : null, canonical),
  };
}

// ---------- generic web ----------

function findDatePublished(node: unknown, depth = 0): string | null {
  if (depth > 6 || !node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findDatePublished(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.datePublished === "string") return record.datePublished;
  for (const value of Object.values(record)) {
    const found = findDatePublished(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function metaContent(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return null;
}

// Block-level closers become newlines so adjacent blocks don't glue words together once
// textContent flattens them (real pages usually have whitespace there, minified ones don't).
function separateBlocks(html: string): string {
  return html.replace(/<\/(?:p|div|h[1-6]|li|tr|td|th|section|article|header|footer|blockquote|ul|ol|table|figure|figcaption|dd|dt)\s*>|<br\s*\/?>/gi, "$&\n");
}

const SUPPRESSED_TEXT_TAGS = new Set(["script", "style", "noscript", "svg", "template", "title"]);
const BLOCK_TAGS = new Set(["p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "tr", "td", "th", "table", "section", "article", "header", "footer", "blockquote", "figure", "figcaption", "dd", "dt", "main", "aside"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", euro: "€", copy: "©", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));/g, (match, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    try {
      return String.fromCodePoint(dec ? Number(dec) : parseInt(hex!, 16));
    } catch {
      return match;
    }
  });
}

const MEASURE_CHUNK = 4096;
const HIDDEN_BLOCKS = ["script", "style", "noscript", "template", "svg", "title"];
const HIDDEN_CLOSERS: Record<string, RegExp> = Object.fromEntries(HIDDEN_BLOCKS.map((tag) => [tag, new RegExp(`</${tag}`, "gi")]));

/**
 * Visible text without a parser, for pages too deep or too wide for a DOM. Every `<`, `>` and
 * closing tag is found with indexOf from the current position, so unclosed tags can't make it
 * super-linear the way `<[^>]*>` would.
 */
function stripTags(html: string): string {
  // Positions must come from `html` itself: lowercasing can change the length ("İ" becomes two
  // code units), so indexes found in a lowercased copy drift.
  const out: string[] = [];
  let pos = 0;
  while (pos < html.length) {
    const lt = html.indexOf("<", pos);
    if (lt === -1) {
      out.push(html.slice(pos));
      break;
    }
    out.push(html.slice(pos, lt));
    const gt = html.indexOf(">", lt);
    if (gt === -1) break;
    const hidden = HIDDEN_BLOCKS.find(
      (tag) => html.slice(lt + 1, lt + 1 + tag.length).toLowerCase() === tag && !/[a-z0-9]/i.test(html.charAt(lt + 1 + tag.length)),
    );
    if (hidden) {
      const closer = HIDDEN_CLOSERS[hidden]!;
      closer.lastIndex = gt;
      const close = closer.exec(html)?.index ?? -1;
      if (close === -1) break;
      const end = html.indexOf(">", close);
      pos = end === -1 ? html.length : end + 1;
    } else {
      out.push(" ");
      pos = gt + 1;
    }
  }
  return collapseWhitespace(decodeEntities(out.join("")));
}

/**
 * Measures nesting depth and element count, and collects visible text, without building a DOM.
 * It runs htmlparser2 with the options linkedom uses, and linkedom builds its tree from these
 * same open/close callbacks, so the depth measured here is the depth linkedom would build. A
 * hand-written scanner disagreed with the parser on input like `<script_x>`, `<!-->` or
 * `<div/>`, and every disagreement let a deep page reach linkedom.
 *
 * htmlparser2 is itself quadratic in depth (500 KB of nested divs took 4.6 s), so the input is
 * fed in chunks and feeding stops as soon as a limit is passed: until then depth is at most
 * MAX_NESTING_DEPTH and every step is cheap. `text` is only complete when `exceeded` is false.
 */
function measureHtml(html: string): { exceeded: boolean; text: string; maxDepth: number; elements: number } {
  const parts: string[] = [];
  const suppressed: boolean[] = [];
  let suppressedCount = 0;
  let elements = 0;
  let maxDepth = 0;
  let exceeded = false;

  const parser = new Parser(
    {
      onopentag(name) {
        elements++;
        if (suppressed.length >= MAX_NESTING_DEPTH || elements > MAX_ELEMENTS_FOR_DOM) exceeded = true;
        const lower = name.toLowerCase();
        if (BLOCK_TAGS.has(lower)) parts.push(" ");
        const hidden = SUPPRESSED_TEXT_TAGS.has(lower);
        if (hidden) suppressedCount++;
        suppressed.push(hidden);
        if (suppressed.length > maxDepth) maxDepth = suppressed.length;
      },
      onclosetag(name) {
        if (suppressed.pop()) suppressedCount--;
        if (BLOCK_TAGS.has(name.toLowerCase())) parts.push(" ");
      },
      ontext(text) {
        if (suppressedCount === 0) parts.push(text);
      },
    },
    { lowerCaseAttributeNames: false, decodeEntities: true, xmlMode: false },
  );
  for (let i = 0; i < html.length && !exceeded; i += MEASURE_CHUNK) parser.write(html.slice(i, i + MEASURE_CHUNK));
  if (exceeded) return { exceeded, text: "", maxDepth, elements };
  parser.end();
  return { exceeded, text: collapseWhitespace(parts.join("")), maxDepth, elements };
}

type Extracted = { title: string | null; text: string; postedAt: string | null; imageUrl: string | null };

// Metadata for pages we refuse to hand to a DOM: bounded regexes over <meta> tags only.
function extractFlatMetadata(html: string, finalUrl: string, now: Date): Omit<Extracted, "text"> {
  const titleRaw = /<title[^>]{0,200}>([^<]{0,500})/i.exec(html)?.[1];
  const metas = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]{0,1000}>/gi)) {
    const key = /\b(?:property|name)\s*=\s*["']?([^"'\s>]{1,64})/i.exec(tag[0])?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0]);
    const value = content?.[1] ?? content?.[2];
    if (key && value && !metas.has(key)) metas.set(key, decodeEntities(value));
  }
  return {
    title: collapseWhitespace(decodeEntities(titleRaw ?? "") || metas.get("og:title") || "") || null,
    postedAt: toIso(metas.get("article:published_time") ?? metas.get("og:published_time"), now),
    imageUrl: httpUrl(metas.get("og:image"), finalUrl),
  };
}

function extractHtml(rawHtml: string, finalUrl: string, now: Date): Extracted {
  const html = rawHtml.length > MAX_HTML_CHARS ? rawHtml.slice(0, MAX_HTML_CHARS) : rawHtml;
  const prepared = separateBlocks(html);
  // Measure exactly the string linkedom would parse.
  const scan = measureHtml(prepared);
  if (scan.exceeded) return { ...extractFlatMetadata(html, finalUrl, now), text: stripTags(prepared) };

  const { document } = parseHTML(prepared);

  const title = collapseWhitespace(document.title || metaContent(document, ['meta[property="og:title"]']) || "") || null;
  const imageUrl = httpUrl(metaContent(document, ['meta[property="og:image"]', 'meta[name="og:image"]']), finalUrl);

  let postedAt = toIso(
    metaContent(document, [
      'meta[property="article:published_time"]',
      'meta[property="og:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="og:published_time"]',
    ]),
    now,
  );
  if (!postedAt) {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        postedAt = toIso(findDatePublished(JSON.parse(script.textContent ?? "")), now);
      } catch {
        // malformed JSON-LD is common; skip it
      }
      if (postedAt) break;
    }
  }

  // Readability mutates the document, so this has to come after the metadata reads.
  let text = "";
  if (scan.maxDepth * scan.elements <= READABILITY_BUDGET) {
    try {
      text = collapseWhitespace(new Readability(document as unknown as Document, { charThreshold: 100 }).parse()?.textContent ?? "");
    } catch {
      text = "";
    }
  }

  // The measuring pass already collected the visible text, so a page Readability can't handle
  // doesn't need a second parse.
  if (text.length < MIN_TEXT_CHARS) text = scan.text;

  return { title, text, postedAt, imageUrl };
}

async function loadWeb(url: string, fetcher: Fetcher, now: Date): Promise<SourceContent> {
  let res;
  try {
    res = await fetcher(url, { accept: WEB_ACCEPT });
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    return needsScreenshot(url, classifyFetchError(error));
  }

  const mime = res.contentType.toLowerCase();
  if (mime.startsWith("application/json")) return needsScreenshot(url, "unsupported_content");

  let title: string | null = null;
  let text: string;
  let postedAt: string | null = null;
  let imageUrl: string | null = null;
  try {
    const decoded = decode(res.body, res.contentType, mime.startsWith("text/html") || mime.startsWith("application/xhtml"));
    if (decoded === null) return needsScreenshot(url, "unsupported_content");
    if (mime.startsWith("text/plain")) {
      text = collapseWhitespace(decoded);
    } else {
      ({ title, text, postedAt, imageUrl } = extractHtml(decoded, res.url, now));
    }
  } catch {
    return needsScreenshot(url, "unsupported_content");
  }

  text = truncate(text);
  if (text.length < MIN_TEXT_CHARS) return needsScreenshot(url, "empty");

  const result: TextContent = { kind: "text", platform: "web", url, finalUrl: res.url, title, text, postedAt, imageUrl };
  return result;
}

export async function loadSource(
  url: string,
  deps: { fetch?: typeof safeFetch; now?: () => Date } = {},
): Promise<SourceContent> {
  const fetcher = deps.fetch ?? safeFetch;
  const now = (deps.now ?? (() => new Date()))();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError("bad_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new UnsafeUrlError("bad_scheme");

  const screenshotOnly = screenshotOnlyReason(parsed);
  if (screenshotOnly) return needsScreenshot(url, screenshotOnly);
  if (hostMatches(normalizedHost(parsed), TIKTOK_HOSTS)) return loadTiktok(url, fetcher, now);
  return loadWeb(url, fetcher, now);
}

// "instagram.com." is the same host; without this the platform routing would be bypassed.
function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/**
 * Platforms we never fetch, so callers can skip rate limits and budgets for them before
 * calling loadSource.
 */
export function screenshotOnlyReason(url: URL): "instagram" | "unsupported_platform" | null {
  const host = normalizedHost(url);
  if (hostMatches(host, INSTAGRAM_HOSTS)) return "instagram";
  if (hostMatches(host, FACEBOOK_HOSTS)) return "unsupported_platform";
  return null;
}
