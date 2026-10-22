const TRACKING_EXACT = new Set(["fbclid", "gclid", "igsh", "igshid", "si", "ref", "ref_src", "_t", "_r"]);
const TRACKING_PREFIXES = ["utm_", "share_", "mc_"];
const TIKTOK_ONLY = new Set(["is_from_webapp", "sender_device"]);

const UNRESERVED = /[A-Za-z0-9\-._~]/;

// Uppercases the hex of %xx escapes and decodes the ones that stand for unreserved characters,
// so "%7euser" and "~user" (or "%e2%9c%93" and "%E2%9C%93") compare equal.
function normalizeEscapes(value: string): string {
  return value.replace(/%([0-9a-fA-F]{2})/g, (_match, hex: string) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

function paramName(pair: string): string {
  const raw = pair.split("=", 1)[0] ?? "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isTracking(name: string, tiktok: boolean): boolean {
  return (
    TRACKING_EXACT.has(name) ||
    TRACKING_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    (tiktok && TIKTOK_ONLY.has(name))
  );
}

// "www.example.com" -> "example.com", but never "m.com" -> "com".
function stripSubdomain(host: string, label: string): string {
  const prefix = `${label}.`;
  if (!host.startsWith(prefix)) return host;
  const rest = host.slice(prefix.length);
  return rest.includes(".") ? rest : host;
}

/**
 * A canonical form of a deal's source link, used to spot the same post submitted twice.
 * Returns null for anything that is not an http(s) URL.
 *
 * - the scheme becomes https (http and https are the same page) and the host is lowercased;
 *   "www." and "m." prefixes, a trailing dot on the host, the default port, credentials and the
 *   fragment are dropped;
 * - tracking parameters (utm_*, fbclid, gclid, igsh, igshid, si, ref, ref_src, _t, _r, share_*,
 *   mc_*, and for TikTok is_from_webapp and sender_device) are removed, the rest are sorted;
 * - a trailing slash is dropped (except on the root), and percent-escapes are normalized;
 * - TikTok "/@user/video/<id>" becomes "/video/<id>" with no query, so links that differ only
 *   in the user handle match. The vm.tiktok.com and vt.tiktok.com short links are left as they
 *   are: resolving them needs a request, and this function never makes one;
 * - Instagram "/p/<code>" and "/reel/<code>" (also with a "/<user>" prefix), "/reels/<code>" and
 *   "/tv/<code>" lose their query;
 * - "+" and "%20" in the remaining query are the same.
 */
export function normalizeSourceUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = stripSubdomain(stripSubdomain(url.hostname.toLowerCase().replace(/\.$/, ""), "www"), "m");
  if (host === "") return null;
  // url.port is already empty for the scheme's default port. http and https count as the same
  // page: sites redirect one to the other, and a link pasted as http would otherwise slip past
  // the duplicate check.
  const origin = `https://${host}${url.port ? `:${url.port}` : ""}`;

  let path = normalizeEscapes(url.pathname);
  const isTiktok = host === "tiktok.com";

  if (isTiktok) {
    const video = path.match(/^\/@[^/]+\/video\/(\d+)\/?$/);
    if (video) return `${origin}/video/${video[1]}`;
  }
  if (host === "instagram.com") {
    // /p and /reel also appear under a "/<user>" prefix; they are the same post, so the prefix goes.
    const post = path.match(/^(?:\/[^/]+)?\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
    if (post) return `${origin}/${post[1]}/${post[2]}`;
    const other = path.match(/^\/(reels|tv)\/([A-Za-z0-9_-]+)\/?$/);
    if (other) return `${origin}/${other[1]}/${other[2]}`;
  }

  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";

  const pairs = url.search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => pair !== "" && !isTracking(paramName(pair), isTiktok))
    // In a query "+" is a space, the same as %20 (a literal plus is %2B).
    .map((pair) => normalizeEscapes(pair.replace(/\+/g, "%20")))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return `${origin}${path}${pairs.length > 0 ? `?${pairs.join("&")}` : ""}`;
}
