import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { Agent, interceptors, request as undiciRequest } from "undici";
import { isPublicAddress } from "./ip-policy.ts";

export type UnsafeUrlCode =
  | "bad_scheme"
  | "bad_port"
  | "credentials"
  | "private_address"
  | "dns_failed"
  | "too_many_redirects"
  | "bad_url";

// `code` is for server logs only. `message` is deliberately identical for every code and never
// carries the host, IP or DNS result: an endpoint that echoed these differences would turn
// the server into a port/DNS oracle for internal networks. Endpoints must map every
// UnsafeUrlError to one user-facing message, and must never serialize FetchFailedError.cause
// (it can hold socket errors with internal addresses).
export class UnsafeUrlError extends Error {
  constructor(readonly code: UnsafeUrlCode) {
    super("url_not_allowed");
    this.name = "UnsafeUrlError";
  }
}

export type FetchFailedCode = "timeout" | "too_large" | "http_status" | "network" | "bad_content_type";

export class FetchFailedError extends Error {
  constructor(
    readonly code: FetchFailedCode,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(status ? `Fetch failed: ${code} (${status})` : `Fetch failed: ${code}`, options);
    this.name = "FetchFailedError";
  }
}

export type SafeResponse = { url: string; status: number; contentType: string; body: Buffer };

export type LookupResult = { address: string; family: number };
export type LookupFn = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupResult[]>;

export type RequestInput = {
  url: URL;
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  signal: AbortSignal;
  /** Cap for the decompressed body, enforced again by the caller while streaming. */
  maxBytes: number;
};
export type RequestResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  close?: () => void;
};
export type RequestFn = (input: RequestInput) => Promise<RequestResult>;

export type SafeFetchOptions = {
  /** Allowed content types, matched exactly on the part before any `;` parameters. */
  accept?: string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
};

const DEFAULT_ACCEPT = ["text/html", "application/xhtml+xml", "text/plain", "application/json"];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SCHEME_PORT: Record<string, string> = { "http:": "80", "https:": "443" };

const defaultLookup: LookupFn = (hostname, options) => dnsLookup(hostname, options);

// Handed to net/tls.connect as `lookup`: whatever name undici asks about, the answer is the
// address we already vetted, so a second (rebinding) DNS answer is never consulted.
export function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export function createPinnedAgent(address: string, family: 4 | 6): Agent {
  return new Agent({
    connect: { lookup: pinnedLookup(address, family) },
    // One connection per hop: pooled sockets would outlive the validation that justified them.
    connections: 1,
    pipelining: 0,
    keepAliveTimeout: 1,
  });
}

export const defaultRequest: RequestFn = async ({ url, address, family, headers, signal, maxBytes }) => {
  const agent = createPinnedAgent(address, family);
  // Creating the interceptor makes undici print a one-time ExperimentalWarning; there is no
  // option to silence it, and hand-rolled zlib handling would be more risk than the noise is worth.
  const dispatcher = agent.compose(interceptors.decompress({ maxSize: maxBytes }));
  const close = () => void agent.destroy().catch(() => {});
  try {
    // undici's request() never follows redirects on its own; safeFetch walks them so every hop is re-validated.
    const res = await undiciRequest(url, {
      method: "GET",
      headers,
      dispatcher,
      signal,
    });
    // Destroying (or aborting) a body nobody read makes undici emit an error on it; without a
    // listener that is an uncaught exception that kills the process. Attach before any await.
    res.body.on("error", () => {});
    return {
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
      close: () => {
        res.body.destroy();
        close();
      },
    };
  } catch (error) {
    close();
    throw error;
  }
};

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function isLocalName(host: string): boolean {
  const h = host.replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal");
}

function parseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("bad_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("bad_scheme");
  if (url.username || url.password) throw new UnsafeUrlError("credentials");
  if (url.port !== "" && url.port !== SCHEME_PORT[url.protocol]) throw new UnsafeUrlError("bad_port");
  if (!url.hostname) throw new UnsafeUrlError("bad_url");
  return url;
}

type Target = { address: string; family: 4 | 6 };

async function resolveTargets(url: URL, lookup: LookupFn, abortable: <T>(p: Promise<T>) => Promise<T>): Promise<Target[]> {
  const host = stripBrackets(url.hostname);
  const literalFamily = isIP(host);
  if (literalFamily) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError("private_address");
    return [{ address: host, family: literalFamily as 4 | 6 }];
  }
  if (isLocalName(host)) throw new UnsafeUrlError("private_address");

  let answers: LookupResult[];
  try {
    answers = await abortable(lookup(host, { all: true, verbatim: true }));
  } catch (error) {
    if (error instanceof FetchFailedError) throw error;
    throw new UnsafeUrlError("dns_failed");
  }
  if (answers.length === 0) throw new UnsafeUrlError("dns_failed");
  // One private record is enough to reject: the host is attacker-controlled DNS and could
  // otherwise serve both.
  if (!answers.every((a) => isPublicAddress(a.address))) throw new UnsafeUrlError("private_address");

  const targets = answers.map((a) => ({ address: a.address, family: (a.family === 6 ? 6 : 4) as 4 | 6 }));
  return targets.sort((a, b) => a.family - b.family);
}

function headerString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
  deps: { lookup?: LookupFn; request?: RequestFn } = {},
): Promise<SafeResponse> {
  const accept = options.accept ?? DEFAULT_ACCEPT;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = options.maxRedirects ?? 3;
  const lookup = deps.lookup ?? defaultLookup;
  const request = deps.request ?? defaultRequest;

  const headers: Record<string, string> = {
    "user-agent": `fentezfoamea/1.0 (+${process.env.SCRAPER_CONTACT ?? "https://github.com/flvvius/fentez_foamea"})`,
    "accept-language": "ro,en;q=0.8",
    accept: accept.join(","),
    "accept-encoding": "gzip, deflate, br",
    ...Object.fromEntries(
      Object.entries(options.headers ?? {})
        .filter(([key]) => key.toLowerCase() !== "host")
        .map(([key, value]) => [key.toLowerCase(), value]),
    ),
  };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // DNS lookups can't be cancelled, so race them against the abort signal.
  const abortable = <T>(promise: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (controller.signal.aborted) return reject(new FetchFailedError("timeout"));
      const onAbort = () => reject(new FetchFailedError("timeout"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
      promise.then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", onAbort));
    });

  try {
    let url = parseUrl(input);

    for (let hop = 0; ; hop++) {
      const targets = await resolveTargets(url, lookup, abortable);

      let result: RequestResult | undefined;
      let lastError: unknown;
      for (const target of targets) {
        try {
          result = await request({ url, address: target.address, family: target.family, headers, signal: controller.signal, maxBytes });
          break;
        } catch (error) {
          lastError = error;
          if (timedOut) throw new FetchFailedError("timeout");
        }
      }
      if (!result) throw new FetchFailedError("network", undefined, { cause: lastError });

      try {
        if (REDIRECT_STATUSES.has(result.status)) {
          const location = headerString(result.headers.location);
          if (location) {
            if (hop >= maxRedirects) throw new UnsafeUrlError("too_many_redirects");
            let next: URL;
            try {
              next = new URL(location, url);
            } catch {
              throw new UnsafeUrlError("bad_url");
            }
            url = parseUrl(next.href);
            continue;
          }
        }

        if (result.status < 200 || result.status > 299) throw new FetchFailedError("http_status", result.status);

        const contentType = headerString(result.headers["content-type"]);
        const mime = (contentType.split(";")[0] ?? "").trim().toLowerCase();
        if (!accept.some((allowed) => mime === allowed.toLowerCase())) throw new FetchFailedError("bad_content_type", result.status);

        const declared = Number(headerString(result.headers["content-length"]));
        if (Number.isFinite(declared) && declared > maxBytes) throw new FetchFailedError("too_large", result.status);

        const chunks: Buffer[] = [];
        let total = 0;
        try {
          for await (const chunk of result.body) {
            total += chunk.byteLength;
            if (total > maxBytes) throw new FetchFailedError("too_large", result.status);
            chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          }
        } catch (error) {
          if (error instanceof FetchFailedError) throw error;
          if (timedOut) throw new FetchFailedError("timeout");
          if ((error as { code?: string } | null)?.code === "UND_ERR_RES_EXCEEDED_MAX_SIZE") throw new FetchFailedError("too_large", result.status);
          throw new FetchFailedError("network", result.status, { cause: error });
        }
        return { url: url.href, status: result.status, contentType, body: Buffer.concat(chunks, total) };
      } finally {
        result.close?.();
      }
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError || error instanceof FetchFailedError) throw error;
    if (timedOut) throw new FetchFailedError("timeout");
    throw new FetchFailedError("network", undefined, { cause: error });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
