import { env } from "./env.ts";
import type { Logger } from "./log.ts";
import { Throttle, sleep } from "./throttle.ts";

export type RequestOptions = {
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  timeoutMs?: number;
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class PoliteHttp {
  private readonly throttles = new Map<string, Throttle>();

  constructor(
    private readonly log: Logger,
    private readonly minIntervalMs = 1500,
    private readonly maxAttempts = 3,
  ) {}

  get userAgent(): string {
    return `fentezfoamea-bot/0.1 (+${env.contact()})`;
  }

  async text(url: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(url, options);
    return response.text();
  }

  async bytes(url: string, options: RequestOptions = {}): Promise<Uint8Array> {
    const response = await this.request(url, options);
    return new Uint8Array(await response.arrayBuffer());
  }

  async json<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(url, {
      ...options,
      headers: { accept: "application/json", ...options.headers },
    });
    return (await response.json()) as T;
  }

  private async request(url: string, options: RequestOptions): Promise<Response> {
    const host = new URL(url).host;
    for (let attempt = 1; ; attempt++) {
      await this.throttleFor(host).wait();
      const response = await fetch(url, {
        method: options.method ?? "GET",
        body: options.body,
        headers: { "user-agent": this.userAgent, ...options.headers },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      if (response.ok) return response;
      if (!RETRYABLE.has(response.status) || attempt >= this.maxAttempts) {
        throw new HttpError(response.status, url);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 2000;
      this.log.warn("retrying", { url, status: response.status, backoff });
      await sleep(backoff);
    }
  }

  private throttleFor(host: string): Throttle {
    let throttle = this.throttles.get(host);
    if (!throttle) {
      throttle = new Throttle(this.minIntervalMs);
      this.throttles.set(host, throttle);
    }
    return throttle;
  }
}
