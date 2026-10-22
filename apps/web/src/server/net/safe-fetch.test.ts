import { describe, expect, it, vi } from "vitest";
import {
  FetchFailedError,
  UnsafeUrlError,
  createPinnedAgent,
  pinnedLookup,
  safeFetch,
  type LookupFn,
  type RequestFn,
  type RequestInput,
  type RequestResult,
} from "./safe-fetch.ts";
import { Agent } from "undici";

const PUBLIC_V4 = "93.184.216.34";

function html(text = "<p>hello</p>"): Partial<RequestResult> & { chunks?: string[] } {
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, chunks: [text] };
}

function redirect(location: string, status = 302) {
  return { status, headers: { location }, chunks: [] };
}

type Step = Partial<RequestResult> & { chunks?: string[] };

function setup(steps: Step[], dns: Record<string, string[]> = {}) {
  const lookup = vi.fn<LookupFn>(async (host) => {
    const answers = dns[host] ?? [PUBLIC_V4];
    if (answers.length === 0) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  });
  const calls: RequestInput[] = [];
  const closed = vi.fn();
  const request = vi.fn<RequestFn>(async (input) => {
    calls.push(input);
    const step = steps[calls.length - 1] ?? steps[steps.length - 1]!;
    async function* body() {
      for (const chunk of step.chunks ?? []) yield Buffer.from(chunk);
    }
    return {
      status: step.status ?? 200,
      headers: step.headers ?? {},
      body: step.body ?? body(),
      close: closed,
    };
  });
  return { lookup, request, calls, closed };
}

describe("safeFetch URL validation", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://example.com/",
    "data:text/html,<h1>x</h1>",
    "javascript:alert(1)",
  ])("rejects scheme in %s", async (url) => {
    const { lookup, request } = setup([html()]);
    await expect(safeFetch(url, {}, { lookup, request })).rejects.toMatchObject({ code: "bad_scheme" });
    expect(lookup).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects unparsable URLs", async () => {
    const { lookup, request } = setup([html()]);
    await expect(safeFetch("not a url", {}, { lookup, request })).rejects.toMatchObject({ code: "bad_url" });
    await expect(safeFetch("http://", {}, { lookup, request })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it.each(["http://example.com:22/", "https://example.com:6379/", "http://example.com:8080/", "https://example.com:8443/x", "http://example.com:443/", "https://example.com:80/"])(
    "rejects port in %s",
    async (url) => {
      const { lookup, request } = setup([html()]);
      await expect(safeFetch(url, {}, { lookup, request })).rejects.toMatchObject({ code: "bad_port" });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(["http://example.com/", "http://example.com:80/", "https://example.com:443/", "https://example.com/"])(
    "accepts default ports in %s",
    async (url) => {
      const { lookup, request } = setup([html()]);
      await expect(safeFetch(url, {}, { lookup, request })).resolves.toMatchObject({ status: 200 });
    },
  );

  it.each(["http://user@example.com/", "http://user:pw@example.com/", "https://:pw@example.com/"])(
    "rejects credentials in %s",
    async (url) => {
      const { lookup, request } = setup([html()]);
      await expect(safeFetch(url, {}, { lookup, request })).rejects.toMatchObject({ code: "credentials" });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([
    "http://localhost/",
    "http://LOCALHOST:80/",
    "http://localhost./",
    "http://foo.localhost/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://017700000001/",
    "http://0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[fe80::1]/",
    "http://[::]/",
    "http://10.1.2.3/",
    "http://192.168.0.1/",
  ])("rejects local or private literal %s before any lookup or connection", async (url) => {
    const { lookup, request } = setup([html()]);
    await expect(safeFetch(url, {}, { lookup, request })).rejects.toMatchObject({ code: "private_address" });
    expect(lookup).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("uses one generic message for every UnsafeUrlError, with no host, IP or DNS detail", async () => {
    const lookups: Record<string, LookupFn> = {
      "https://nx.example/": async () => {
        throw new Error("ENOTFOUND nx.example 10.9.9.9");
      },
      "https://evil.example/": async () => [{ address: "10.1.2.3", family: 4 }],
    };
    const urls = ["file:///etc/passwd", "http://example.com:22/", "http://u:p@example.com/", "http://127.0.0.1/", "https://nx.example/", "https://evil.example/", "nope"];
    const errors: UnsafeUrlError[] = [];
    for (const url of urls) {
      const { request } = setup([html()]);
      const lookup = lookups[url] ?? setup([]).lookup;
      errors.push(await safeFetch(url, {}, { lookup, request }).then(() => { throw new Error("should reject"); }, (e) => e));
    }
    expect(new Set(errors.map((e) => e.message))).toEqual(new Set(["url_not_allowed"]));
    expect(new Set(errors.map((e) => e.code)).size).toBeGreaterThan(4);
  });

  it("accepts a public IP literal without DNS and pins it", async () => {
    const { lookup, request, calls } = setup([html()]);
    await safeFetch("http://8.8.8.8/", {}, { lookup, request });
    expect(lookup).not.toHaveBeenCalled();
    expect(calls[0]).toMatchObject({ address: "8.8.8.8", family: 4 });
  });

  it("pins public IPv6 literals", async () => {
    const { lookup, request, calls } = setup([html()]);
    await safeFetch("http://[2606:4700::1111]/", {}, { lookup, request });
    expect(calls[0]).toMatchObject({ address: "2606:4700::1111", family: 6 });
  });
});

describe("safeFetch DNS handling", () => {
  it("rejects a hostname that resolves to a private address", async () => {
    const { lookup, request } = setup([html()], { "evil.example": ["10.0.0.5"] });
    await expect(safeFetch("https://evil.example/", {}, { lookup, request })).rejects.toMatchObject({ code: "private_address" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects when any answer is private, even mixed with public ones", async () => {
    const { lookup, request } = setup([html()], { "mixed.example": [PUBLIC_V4, "127.0.0.1"] });
    await expect(safeFetch("https://mixed.example/", {}, { lookup, request })).rejects.toMatchObject({ code: "private_address" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a private IPv6 answer mixed with public IPv4", async () => {
    const { lookup, request } = setup([html()], { "mixed.example": [PUBLIC_V4, "::ffff:169.254.169.254"] });
    await expect(safeFetch("https://mixed.example/", {}, { lookup, request })).rejects.toMatchObject({ code: "private_address" });
  });

  it("reports DNS failures and empty answers", async () => {
    const { lookup, request } = setup([html()], { "nx.example": [] });
    await expect(safeFetch("https://nx.example/", {}, { lookup, request })).rejects.toMatchObject({ code: "dns_failed" });
    const empty: LookupFn = async () => [];
    await expect(safeFetch("https://nx.example/", {}, { lookup: empty, request })).rejects.toMatchObject({ code: "dns_failed" });
  });

  it("asks for all addresses without reordering by the resolver", async () => {
    const { lookup, request } = setup([html()]);
    await safeFetch("https://example.com/", {}, { lookup, request });
    expect(lookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
  });

  it("passes exactly the validated address to the request function", async () => {
    const { lookup, request, calls } = setup([html()], { "example.com": ["203.0.114.7"] });
    const res = await safeFetch("https://example.com/path?q=1", {}, { lookup, request });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.address).toBe("203.0.114.7");
    expect(calls[0]!.url.hostname).toBe("example.com");
    expect(res.url).toBe("https://example.com/path?q=1");
  });

  it("falls back to the next validated address on connection failure", async () => {
    const { lookup } = setup([], { "dual.example": ["2606:4700::1111", "104.16.0.1"] });
    const tried: string[] = [];
    const request: RequestFn = async ({ address }) => {
      tried.push(address);
      if (!address.includes(":")) throw new Error("ECONNREFUSED");
      return { status: 200, headers: { "content-type": "text/plain" }, body: (async function* () { yield Buffer.from("ok"); })() };
    };
    const res = await safeFetch("https://dual.example/", {}, { lookup, request });
    expect(tried).toEqual(["104.16.0.1", "2606:4700::1111"]); // IPv4 first, then the other validated address
    expect(res.body.toString()).toBe("ok");
  });

  it("sends the identifying headers and merges caller headers", async () => {
    const { lookup, request, calls } = setup([html()]);
    await safeFetch("https://example.com/", { headers: { "X-Test": "1", Host: "evil" } }, { lookup, request });
    const headers = calls[0]!.headers;
    expect(headers["user-agent"]).toMatch(/^fentezfoamea\/1\.0 \(\+.+\)$/);
    expect(headers["accept-language"]).toBe("ro,en;q=0.8");
    expect(headers["x-test"]).toBe("1");
    expect(headers.host).toBeUndefined();
  });
});

describe("safeFetch redirects", () => {
  it("rejects a redirect to the cloud metadata address", async () => {
    const { lookup, request } = setup([redirect("http://169.254.169.254/latest/meta-data/")]);
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "private_address" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect to a hostname that resolves privately", async () => {
    const { lookup, request } = setup([redirect("https://internal.example/admin")], { "internal.example": ["192.168.1.10"] });
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "private_address" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("re-checks the scheme, port and credentials on every hop", async () => {
    for (const [location, code] of [
      ["file:///etc/passwd", "bad_scheme"],
      ["gopher://example.com/", "bad_scheme"],
      ["https://example.com:6379/", "bad_port"],
      ["https://user:pw@example.com/", "credentials"],
    ] as const) {
      const { lookup, request } = setup([redirect(location)]);
      await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code });
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it("re-resolves DNS for each hop and pins each hop separately", async () => {
    const { lookup, request, calls } = setup([redirect("https://b.example/next"), html()], {
      "a.example": ["1.1.1.1"],
      "b.example": ["8.8.4.4"],
    });
    const res = await safeFetch("https://a.example/", {}, { lookup, request });
    expect(calls.map((c) => c.address)).toEqual(["1.1.1.1", "8.8.4.4"]);
    expect(res.url).toBe("https://b.example/next");
  });

  it("resolves relative Location headers against the current URL", async () => {
    const { lookup, request, calls } = setup([redirect("/moved?x=1", 301), redirect("deeper", 307), html()]);
    const res = await safeFetch("https://example.com/a/b", {}, { lookup, request });
    expect(calls.map((c) => c.url.href)).toEqual([
      "https://example.com/a/b",
      "https://example.com/moved?x=1",
      "https://example.com/deeper",
    ]);
    expect(res.url).toBe("https://example.com/deeper");
  });

  it("caps the number of redirects", async () => {
    const { lookup, request } = setup([redirect("/loop")]);
    await expect(safeFetch("https://example.com/", { maxRedirects: 3 }, { lookup, request })).rejects.toMatchObject({
      code: "too_many_redirects",
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("follows exactly maxRedirects hops", async () => {
    const { lookup, request } = setup([redirect("/1"), redirect("/2"), redirect("/3"), html()]);
    await expect(safeFetch("https://example.com/", { maxRedirects: 3 }, { lookup, request })).resolves.toMatchObject({
      url: "https://example.com/3",
    });
  });

  it("treats a redirect without Location as an HTTP error", async () => {
    const { lookup, request } = setup([{ status: 302, headers: {}, chunks: [] }]);
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "http_status", status: 302 });
  });

  it("closes every hop's response", async () => {
    const { lookup, request, closed } = setup([redirect("/next"), html()]);
    await safeFetch("https://example.com/", {}, { lookup, request });
    expect(closed).toHaveBeenCalledTimes(2);
  });
});

describe("safeFetch response handling", () => {
  it("times out a request that never answers", async () => {
    const { lookup } = setup([]);
    const request: RequestFn = ({ signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    await expect(safeFetch("https://example.com/", { timeoutMs: 30 }, { lookup, request })).rejects.toMatchObject({ code: "timeout" });
  });

  it("times out a hanging DNS lookup", async () => {
    const lookup: LookupFn = () => new Promise(() => {});
    const request = vi.fn<RequestFn>();
    await expect(safeFetch("https://example.com/", { timeoutMs: 30 }, { lookup, request })).rejects.toMatchObject({ code: "timeout" });
    expect(request).not.toHaveBeenCalled();
  });

  it("times out a body that stalls", async () => {
    const { lookup } = setup([]);
    const request: RequestFn = async ({ signal }) => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: (async function* () {
        yield Buffer.from("partial");
        await new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      })(),
    });
    await expect(safeFetch("https://example.com/", { timeoutMs: 30 }, { lookup, request })).rejects.toMatchObject({ code: "timeout" });
  });

  it("applies the timeout across redirects, not per hop", async () => {
    const { lookup } = setup([]);
    let n = 0;
    const request: RequestFn = async ({ signal }) => {
      n++;
      await new Promise((r) => setTimeout(r, 40));
      if (signal.aborted) throw new Error("aborted");
      return { status: 302, headers: { location: `/hop${n}` }, body: (async function* () {})() };
    };
    await expect(safeFetch("https://example.com/", { timeoutMs: 100, maxRedirects: 10 }, { lookup, request })).rejects.toMatchObject({
      code: "timeout",
    });
    expect(n).toBeLessThan(5);
  });

  it("stops reading once maxBytes is exceeded without Content-Length", async () => {
    const { lookup } = setup([]);
    let yielded = 0;
    const closed = vi.fn();
    const request: RequestFn = async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      close: closed,
      body: (async function* () {
        for (;;) {
          yielded++;
          yield Buffer.alloc(1000, 97);
        }
      })(),
    });
    await expect(safeFetch("https://example.com/", { maxBytes: 5000 }, { lookup, request })).rejects.toMatchObject({ code: "too_large" });
    expect(yielded).toBe(6);
    expect(closed).toHaveBeenCalled();
  });

  it("rejects an oversized declared Content-Length without reading", async () => {
    const { lookup, request } = setup([{ status: 200, headers: { "content-type": "text/html", "content-length": "9999999" }, chunks: ["x"] }]);
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "too_large" });
  });

  it("returns a body exactly at the limit", async () => {
    const { lookup, request } = setup([{ status: 200, headers: { "content-type": "text/plain" }, chunks: ["abcde"] }]);
    const res = await safeFetch("https://example.com/", { maxBytes: 5 }, { lookup, request });
    expect(res.body.toString()).toBe("abcde");
  });

  it("rejects unexpected content types", async () => {
    for (const contentType of ["image/png", "application/pdf", "video/mp4", ""]) {
      const { lookup, request } = setup([{ status: 200, headers: contentType ? { "content-type": contentType } : {}, chunks: ["x"] }]);
      await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "bad_content_type" });
    }
  });

  it("honours a custom accept list", async () => {
    const { lookup, request } = setup([{ status: 200, headers: { "content-type": "application/json; charset=utf-8" }, chunks: ["{}"] }]);
    await expect(safeFetch("https://example.com/", { accept: ["text/html"] }, { lookup, request })).rejects.toMatchObject({ code: "bad_content_type" });
    const second = setup([{ status: 200, headers: { "content-type": "Application/JSON" }, chunks: ["{}"] }]);
    const res = await safeFetch("https://example.com/", { accept: ["application/json"] }, { lookup: second.lookup, request: second.request });
    expect(res.contentType).toBe("Application/JSON");
  });

  it.each(["text/htmlx", "application/jsonp", "text/html-sandboxed", "xtext/html"])("matches content types exactly, not by prefix: %s", async (contentType) => {
    const { lookup, request } = setup([{ status: 200, headers: { "content-type": `${contentType}; charset=utf-8` }, chunks: ["x"] }]);
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "bad_content_type" });
  });

  it("ignores case and parameters when matching content types", async () => {
    const { lookup, request } = setup([{ status: 200, headers: { "content-type": "  Text/HTML ;charset=UTF-8" }, chunks: ["x"] }]);
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).resolves.toMatchObject({ status: 200 });
  });

  it.each([403, 404, 500])("maps HTTP %i to http_status", async (status) => {
    const { lookup, request } = setup([{ status, headers: { "content-type": "text/html" }, chunks: ["nope"] }]);
    const error = await safeFetch("https://example.com/", {}, { lookup, request }).catch((e) => e);
    expect(error).toBeInstanceOf(FetchFailedError);
    expect(error).toMatchObject({ code: "http_status", status });
  });

  it("maps connection errors to network", async () => {
    const { lookup } = setup([]);
    const request: RequestFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(safeFetch("https://example.com/", {}, { lookup, request })).rejects.toMatchObject({ code: "network" });
  });
});

describe("real request path pinning", () => {
  it("pinnedLookup answers only with the validated address, ignoring the hostname", async () => {
    const lookup = pinnedLookup("93.184.216.34", 4);
    const single = await new Promise((resolve) => lookup("rebind.example", {}, (_e, address, family) => resolve({ address, family })));
    expect(single).toEqual({ address: "93.184.216.34", family: 4 });
    const all = await new Promise((resolve) => lookup("rebind.example", { all: true }, (_e, addresses) => resolve(addresses)));
    expect(all).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("builds an undici Agent without connecting", async () => {
    const agent = createPinnedAgent("2606:4700::1111", 6);
    expect(agent).toBeInstanceOf(Agent);
    await agent.destroy();
  });
});
