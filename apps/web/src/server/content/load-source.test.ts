import { describe, expect, it, vi } from "vitest";
import { FetchFailedError, UnsafeUrlError, type SafeResponse, type safeFetch } from "../net/safe-fetch.ts";
import { loadSource } from "./load-source.ts";

type Fetch = typeof safeFetch;
const NOW = new Date("2026-10-22T10:00:00Z");
const now = () => NOW;

function htmlResponse(html: string | Buffer, url: string, contentType = "text/html; charset=utf-8"): SafeResponse {
  return { url, status: 200, contentType, body: Buffer.isBuffer(html) ? html : Buffer.from(html, "utf-8") };
}

function jsonResponse(data: unknown, url = "https://www.tiktok.com/oembed"): SafeResponse {
  return { url, status: 200, contentType: "application/json; charset=utf-8", body: Buffer.from(JSON.stringify(data)) };
}

function fakeFetch(handler: (url: string) => SafeResponse | Error) {
  const fn = vi.fn(async (url: string, _options?: unknown) => {
    const result = handler(url);
    if (result instanceof Error) throw result;
    return result;
  });
  return fn as typeof fn & Fetch;
}

const PROMO_HTML = `<!doctype html>
<html lang="ro"><head>
<meta charset="utf-8">
<title>Weekend la Trattoria Bella | Oferte</title>
<meta property="og:description" content="Două pizza la preț de una">
<meta property="og:image" content="/img/promo.jpg">
<meta property="article:published_time" content="2026-10-15T08:30:00+03:00">
<script>window.tracking = "should not appear";</script>
<style>.x { color: red }</style>
</head><body>
<nav><a href="/">Acasă</a> <a href="/meniu">Meniu</a> <a href="/contact">Contact</a></nav>
<article>
<h1>Ofertă de weekend: două pizza la preț de una</h1>
<p>Vă așteptăm sâmbătă și duminică, între orele 12:00 și 22:00, la Trattoria Bella din Cluj-Napoca. La orice pizza Margherita sau Quattro Formaggi primiți a doua pizza gratuit.</p>
<p>Oferta este valabilă în restaurant, nu și la livrare. Rezervări la telefon. Prețul unei pizza: 32 lei; băuturile nu sunt incluse în promoție.</p>
</article>
<footer>© Trattoria Bella</footer>
</body></html>`;

describe("loadSource: generic web", () => {
  it("extracts readable Romanian text, title, image and date", async () => {
    const fetch = fakeFetch(() => htmlResponse(PROMO_HTML, "https://trattoria.example/oferta"));
    const result = await loadSource("https://trattoria.example/oferta?utm=1", { fetch, now });
    expect(result.kind).toBe("text");
    if (result.kind !== "text") return;
    expect(result.platform).toBe("web");
    expect(result.url).toBe("https://trattoria.example/oferta?utm=1");
    expect(result.finalUrl).toBe("https://trattoria.example/oferta");
    expect(result.title).toBe("Weekend la Trattoria Bella | Oferte");
    expect(result.text).toContain("două pizza la preț de una");
    expect(result.text).toContain("sâmbătă și duminică, între orele 12:00 și 22:00");
    expect(result.text).toContain("32 lei");
    expect(result.text).not.toContain("should not appear");
    expect(result.text).not.toContain("color: red");
    expect(result.text).not.toMatch(/\s{2,}/);
    expect(result.imageUrl).toBe("https://trattoria.example/img/promo.jpg");
    expect(result.postedAt).toBe("2026-10-15T05:30:00.000Z");
  });

  it("does not glue adjacent block elements together", async () => {
    const html = `<html><body><article><h1>Titlu</h1><p>${"Cuvinte despre ofertă și preț. ".repeat(6)}</p><p>Alt paragraf</p></article></body></html>`;
    const fetch = fakeFetch(() => htmlResponse(html, "https://a.example/"));
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind === "text" && result.text.startsWith("Titlu Cuvinte")).toBe(true);
  });

  it("extracts text from a page without article markup, ignoring scripts and styles", async () => {
    const html = `<html><body><nav>MENU LINKS</nav><script>var secret = 1;</script><style>b{}</style><div>Promoție specială: cafea și croissant 15 lei în fiecare dimineață de luni până vineri.</div></body></html>`;
    const fetch = fakeFetch(() => htmlResponse(html, "https://a.example/"));
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind).toBe("text");
    if (result.kind !== "text") return;
    expect(result.text).toContain("cafea și croissant 15 lei");
    expect(result.text).not.toContain("secret");
  });

  it("reads datePublished from JSON-LD, including @graph and bad blocks", async () => {
    const html = `<html><head><title>x</title>
<script type="application/ld+json">{ not json</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"Article","datePublished":"2026-09-30T12:00:00Z"}]}</script>
</head><body><article><p>${"Meniul zilei costă 29 lei și include supă, fel principal și desert. ".repeat(4)}</p></article></body></html>`;
    const fetch = fakeFetch(() => htmlResponse(html, "https://a.example/"));
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind === "text" && result.postedAt).toBe("2026-09-30T12:00:00.000Z");
  });

  it("prefers og:published_time and ignores dates in the far future", async () => {
    const make = (date: string) =>
      `<html><head><meta property="og:published_time" content="${date}"></head><body><article><p>${"Meniul zilei costă 29 lei și include supă și desert. ".repeat(4)}</p></article></body></html>`;
    const fetch = fakeFetch(() => htmlResponse(make("2026-10-01"), "https://a.example/"));
    const ok = await loadSource("https://a.example/", { fetch, now });
    expect(ok.kind === "text" && ok.postedAt).toBe("2026-10-01T00:00:00.000Z");

    const future = fakeFetch(() => htmlResponse(make("2030-01-01"), "https://a.example/"));
    const bad = await loadSource("https://a.example/", { fetch: future, now });
    expect(bad.kind === "text" && bad.postedAt).toBeNull();
  });

  it("only keeps http(s) og:image URLs", async () => {
    const make = (src: string) =>
      `<html><head><meta property="og:image" content="${src}"></head><body><article><p>${"Meniul zilei costă 29 lei și include supă și desert. ".repeat(4)}</p></article></body></html>`;
    for (const src of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd"]) {
      const fetch = fakeFetch(() => htmlResponse(make(src), "https://a.example/"));
      const result = await loadSource("https://a.example/", { fetch, now });
      expect(result.kind === "text" && result.imageUrl).toBeNull();
    }
  });

  it("decodes windows-1250 from the Content-Type header", async () => {
    // "Mâncare bună şi ieftină la Ţuica Veche, doar 20 lei, în fiecare zi" in cp1250 bytes
    const body = Buffer.from(
      `<html><head><title>Ofert\xe3</title></head><body><article><p>${"M\xe2ncare bun\xe3 \xba i ieftin\xe3 la \xdeuica Veche, doar 20 lei, \xeen fiecare zi. ".repeat(3)}</p></article></body></html>`,
      "latin1",
    );
    const fetch = fakeFetch(() => htmlResponse(body, "https://a.example/", "text/html; charset=windows-1250"));
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind).toBe("text");
    if (result.kind !== "text") return;
    expect(result.text).toContain("Mâncare bună ş i ieftină la Ţuica Veche, doar 20 lei, în fiecare zi.");
    expect(result.title).toBe("Ofertă");
  });

  it("detects the charset from <meta> when the header has none", async () => {
    const body = Buffer.from(
      `<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1250"><title>x</title></head><body><article><p>${"Mâncare bun\xe3 \xee n ora\xba, doar 20 lei pentru meniul complet. ".repeat(4)}</p></article></body></html>`,
      "latin1",
    );
    const fetch = fakeFetch(() => htmlResponse(body, "https://a.example/", "text/html"));
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind === "text" && result.text).toContain("bună î n oraş");
  });

  it("falls back to UTF-8 for unknown charsets", async () => {
    const fetch = fakeFetch(() =>
      htmlResponse(`<html><body><article><p>${"Pizza gratuită pentru studenți luni și marți, preț 20 lei. ".repeat(3)}</p></article></body></html>`, "https://a.example/", "text/html; charset=klingon-8"),
    );
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind === "text" && result.text).toContain("Pizza gratuită pentru studenți");
  });

  it("truncates to 12000 characters", async () => {
    const html = `<html><body><article><p>${"Ofertă specială la restaurant. ".repeat(1000)}</p></article></body></html>`;
    const fetch = fakeFetch(() => htmlResponse(html, "https://a.example/"));
    const result = await loadSource("https://a.example/", { fetch, now });
    expect(result.kind === "text" && result.text.length).toBeLessThanOrEqual(12_000);
    expect(result.kind === "text" && result.text.length).toBeGreaterThan(11_900);
  });

  it("returns text/plain as-is, collapsed and truncated", async () => {
    const fetch = fakeFetch(() => htmlResponse("Oferta   zilei:\n\n două pizza la 40 lei, doar azi, la Trattoria.", "https://a.example/t", "text/plain; charset=utf-8"));
    const result = await loadSource("https://a.example/t", { fetch, now });
    expect(result).toMatchObject({ kind: "text", platform: "web", title: null, postedAt: null, imageUrl: null, text: "Oferta zilei: două pizza la 40 lei, doar azi, la Trattoria." });
  });

  it("asks for a screenshot when there is too little text", async () => {
    const fetch = fakeFetch(() => htmlResponse("<html><body><div id='app'></div><script>boot()</script></body></html>", "https://a.example/"));
    expect(await loadSource("https://a.example/", { fetch, now })).toEqual({ kind: "needs_screenshot", url: "https://a.example/", reason: "empty" });
  });

  it("treats JSON from a non-TikTok site as unsupported content", async () => {
    const fetch = fakeFetch(() => jsonResponse({ hello: "world" }, "https://api.example/x"));
    expect(await loadSource("https://api.example/x", { fetch, now })).toEqual({ kind: "needs_screenshot", url: "https://api.example/x", reason: "unsupported_content" });
  });

  it("maps a wrong content type to unsupported_content and other fetch failures to fetch_failed", async () => {
    const wrongType = fakeFetch(() => new FetchFailedError("bad_content_type", 200));
    expect(await loadSource("https://a.example/x.pdf", { fetch: wrongType, now })).toMatchObject({ reason: "unsupported_content" });
    for (const error of [new FetchFailedError("http_status", 404), new FetchFailedError("timeout"), new FetchFailedError("too_large"), new Error("boom")]) {
      const fetch = fakeFetch(() => error);
      expect(await loadSource("https://a.example/", { fetch, now })).toEqual({ kind: "needs_screenshot", url: "https://a.example/", reason: "fetch_failed" });
    }
  });

  it("propagates UnsafeUrlError", async () => {
    const fetch = fakeFetch(() => new UnsafeUrlError("private_address"));
    await expect(loadSource("http://169.254.169.254/", { fetch, now })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("does not offer JSON to generic sites", async () => {
    const fetch = fakeFetch(() => htmlResponse(PROMO_HTML, "https://a.example/"));
    await loadSource("https://a.example/", { fetch, now });
    const accept = (vi.mocked(fetch).mock.calls[0]![1] as { accept: string[] }).accept;
    expect(accept).not.toContain("application/json");
    expect(accept).toContain("text/html");
  });

  it.each(["utf-16le", "UTF-16", "utf-16be", "utf-32", "ucs-2"])("returns unsupported_content for charset=%s instead of throwing", async (charset) => {
    const body = Buffer.from(`<html><body><article><p>${"Meniul zilei costă 29 lei. ".repeat(5)}</p></article></body></html>`, "utf16le");
    const fetch = fakeFetch(() => htmlResponse(body, "https://a.example/", `text/html; charset=${charset}`));
    expect(await loadSource("https://a.example/", { fetch, now })).toEqual({ kind: "needs_screenshot", url: "https://a.example/", reason: "unsupported_content" });
  });

  it("returns unsupported_content for a UTF-16 BOM and for stateful encodings", async () => {
    const bom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<html>x</html>", "utf16le")]);
    const fetch = fakeFetch(() => htmlResponse(bom, "https://a.example/", "text/html"));
    expect(await loadSource("https://a.example/", { fetch, now })).toMatchObject({ reason: "unsupported_content" });
    const hz = fakeFetch(() => htmlResponse("<html><body>x</body></html>", "https://a.example/", "text/html; charset=iso-2022-jp"));
    expect(await loadSource("https://a.example/", { fetch: hz, now })).toMatchObject({ reason: "unsupported_content" });
  });

  it("turns a parser crash into unsupported_content", async () => {
    const fetch = fakeFetch(() => ({ url: "https://a.example/", status: 200, contentType: "text/html", body: { toString: () => { throw new TypeError("boom"); } } as unknown as Buffer }));
    expect(await loadSource("https://a.example/", { fetch, now })).toMatchObject({ reason: "unsupported_content" });
  });

  it("rejects unparsable and non-http URLs without fetching", async () => {
    const fetch = fakeFetch(() => htmlResponse("x", "https://a.example/"));
    await expect(loadSource("nonsense", { fetch, now })).rejects.toMatchObject({ code: "bad_url" });
    await expect(loadSource("file:///etc/passwd", { fetch, now })).rejects.toMatchObject({ code: "bad_scheme" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("loadSource: social platforms", () => {
  it.each([
    "https://www.instagram.com/p/abc/",
    "https://instagram.com/reel/abc/",
    "https://m.instagram.com/p/abc/",
    "https://instagr.am/p/abc",
  ])("sends Instagram URL %s to a screenshot without fetching", async (url) => {
    const fetch = fakeFetch(() => htmlResponse("x", url));
    expect(await loadSource(url, { fetch, now })).toEqual({ kind: "needs_screenshot", url, reason: "instagram" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["https://www.facebook.com/post/1", "https://m.facebook.com/x", "https://fb.com/x", "https://fb.watch/abc"])(
    "marks Facebook URL %s as unsupported without fetching",
    async (url) => {
      const fetch = fakeFetch(() => htmlResponse("x", url));
      expect(await loadSource(url, { fetch, now })).toEqual({ kind: "needs_screenshot", url, reason: "unsupported_platform" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["https://instagram.com./p/abc/", "instagram"],
    ["https://WWW.Instagram.com./p/abc/", "instagram"],
    ["https://www.facebook.com./post/1", "unsupported_platform"],
    ["https://fb.watch./abc", "unsupported_platform"],
  ])("routes trailing-dot host %s by platform without fetching", async (url, reason) => {
    const fetch = fakeFetch(() => htmlResponse("x", url));
    expect(await loadSource(url, { fetch, now })).toEqual({ kind: "needs_screenshot", url, reason });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not treat look-alike hosts as Instagram or TikTok", async () => {
    const fetch = fakeFetch(() => htmlResponse("<html><body>short</body></html>", "https://instagram.com.evil.example/"));
    const result = await loadSource("https://instagram.com.evil.example/", { fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ reason: "empty" });
    expect(await loadSource("https://nottiktok.com/video/1", { fetch, now })).toMatchObject({ reason: "empty" });
  });
});

describe("loadSource: hostile markup", () => {
  const page = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`;
  const run = async (html: string) => {
    const fetch = fakeFetch(() => htmlResponse(html, "https://a.example/"));
    const started = performance.now();
    const result = await loadSource("https://a.example/", { fetch, now });
    return { result, ms: performance.now() - started };
  };

  it.each([
    ["nested div x4000", page("<div>".repeat(4000))],
    ["nested table x2000", page("<table><tr><td>".repeat(2000))],
    ["500 KB nested page", page("<div>".repeat(100_000))],
    ["2 MB nested page", page("<div>".repeat(400_000))],
    ["500 KB of unterminated comments", page("<!--".repeat(125_000))],
    ["500 KB of unclosed tags", page("<a ".repeat(160_000))],
    ["unmatched closers", page("<a>".repeat(100) + "</b>".repeat(100_000))],
    // Inputs a hand-written scanner tokenized differently from the parser linkedom uses.
    ["a script-like tag name hiding nesting", page("<script_x>" + "<div>".repeat(100_000))],
    ["a style-like tag name hiding nesting", page("<style.x>" + "<div>".repeat(100_000))],
    ["an empty comment before nesting", page("<!-->" + "<div>".repeat(100_000) + "-->")],
    ["a dash comment before nesting", page("<!--->" + "<div>".repeat(100_000) + "-->")],
    ["slash-ended open tags", page("<div/>".repeat(80_000))],
    ["slash in an attribute value", page("<div a=/>".repeat(50_000))],
    ["mismatched close names", page("<d_a></d_b>".repeat(40_000))],
  ])("finishes %s well under a second", async (_name, html) => {
    const { result, ms } = await run(html);
    expect(ms).toBeLessThan(1000);
    expect(result).toEqual({ kind: "needs_screenshot", url: "https://a.example/", reason: "empty" });
  });

  it("still returns the text of a deeply nested page", async () => {
    const text = "Oferta zilei: două pizza la 40 lei &amp; băutură gratuită, doar azi la Trattoria Bella.";
    const { result, ms } = await run(
      `<html><head><title>Promo &amp; co</title><meta property="og:image" content="/i.jpg"><meta property="article:published_time" content="2026-10-01T00:00:00Z"></head><body><script>var a="<div>"</script>${"<div>".repeat(5000)}<p>${text}</p><style>p{}</style></body></html>`,
    );
    expect(ms).toBeLessThan(1000);
    expect(result).toMatchObject({
      kind: "text",
      title: "Promo & co",
      text: "Oferta zilei: două pizza la 40 lei & băutură gratuită, doar azi la Trattoria Bella.",
      imageUrl: "https://a.example/i.jpg",
      postedAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("copes with a very wide page without a DOM", async () => {
    const { result, ms } = await run(page("<p>Oferta speciala la restaurant 25 lei.</p>".repeat(11_000)));
    expect(ms).toBeLessThan(1000);
    expect(result.kind).toBe("text");
    if (result.kind === "text") expect(result.text.length).toBeLessThanOrEqual(12_000);
  });

  it("does not hand more than 500 000 characters to the parser", async () => {
    const filler = "<p>Oferta speciala la restaurant 25 lei.</p>".repeat(2000);
    const tail = "<p>SECRET-TAIL-MARKER</p>";
    const { result } = await run(`<html><body><article>${filler}</article>${"<span>x</span>".repeat(40_000)}${tail}</body></html>`);
    expect(result.kind === "text" && result.text.includes("SECRET-TAIL-MARKER")).toBe(false);
  });
});

describe("loadSource: TikTok", () => {
  const VIDEO_ID = "6718335390845095173";
  const VIDEO_URL = `https://www.tiktok.com/@scout2015/video/${VIDEO_ID}`;
  const oembedUrl = (target: string) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`;
  const expectedDate = new Date(Number(BigInt(VIDEO_ID) >> 32n) * 1000).toISOString();

  it("maps oEmbed fields and derives postedAt from the video id", async () => {
    const fetch = fakeFetch((url) => {
      expect(url).toBe(oembedUrl(VIDEO_URL));
      return jsonResponse({
        title: "Burger   + cartofi 25 lei\nla Smash House  #oferta",
        author_name: "Scout",
        thumbnail_url: "https://p16.tiktokcdn.com/thumb.jpg",
        html: "<blockquote></blockquote>",
      });
    });
    const result = await loadSource(VIDEO_URL, { fetch, now });
    expect(result).toEqual({
      kind: "text",
      platform: "tiktok",
      url: VIDEO_URL,
      finalUrl: VIDEO_URL,
      title: "Burger + cartofi 25 lei la Smash House #oferta",
      text: "Burger + cartofi 25 lei la Smash House #oferta Autor: Scout",
      postedAt: expectedDate,
      imageUrl: "https://p16.tiktokcdn.com/thumb.jpg",
    });
    expect(expectedDate.startsWith("2019-")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ accept: ["application/json"] });
  });

  it("shares one 8 s deadline across the oEmbed, short-link and retry requests", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(NOW);
      const short = "https://vm.tiktok.com/ZMabc123/";
      const timeouts: number[] = [];
      const fetch = vi.fn(async (url: string, options?: { timeoutMs?: number }) => {
        timeouts.push(options?.timeoutMs ?? -1);
        vi.setSystemTime(Date.now() + 3000);
        if (url === short) return htmlResponse("<html></html>", VIDEO_URL);
        if (url === oembedUrl(VIDEO_URL)) return jsonResponse({ title: "Pizza 20 lei" });
        throw new FetchFailedError("http_status", 400);
      }) as unknown as Fetch;
      const result = await loadSource(short, { fetch, now });
      expect(result.kind).toBe("text");
      expect(timeouts).toEqual([8000, 5000, 2000]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up once the shared deadline is spent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(NOW);
      const short = "https://vm.tiktok.com/ZMabc123/";
      const fetch = vi.fn(async (url: string) => {
        vi.setSystemTime(Date.now() + 9000);
        if (url === short) return htmlResponse("<html></html>", VIDEO_URL);
        throw new FetchFailedError("timeout");
      }) as unknown as Fetch;
      expect(await loadSource(short, { fetch, now })).toEqual({ kind: "needs_screenshot", url: short, reason: "fetch_failed" });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes trailing-dot TikTok hosts through oEmbed", async () => {
    const fetch = fakeFetch(() => jsonResponse({ title: "Pizza 20 lei" }));
    expect(await loadSource("https://vm.tiktok.com./ZM1/", { fetch, now })).toMatchObject({ kind: "text", platform: "tiktok" });
  });

  it("falls back to embed_product_id and data-video-id when the URL has no id", async () => {
    const short = "https://www.tiktok.com/t/ZT12345/";
    const fetchProduct = fakeFetch(() => jsonResponse({ title: "Pizza 20 lei", embed_product_id: VIDEO_ID }));
    expect(await loadSource(short, { fetch: fetchProduct, now })).toMatchObject({ postedAt: expectedDate });
    const fetchHtml = fakeFetch(() => jsonResponse({ title: "Pizza 20 lei", html: `<blockquote data-video-id="${VIDEO_ID}"></blockquote>` }));
    expect(await loadSource(short, { fetch: fetchHtml, now })).toMatchObject({ postedAt: expectedDate });
  });

  it("ignores video ids that decode to an implausible date", async () => {
    const early = "1000000000"; // decodes to 1970
    const future = (BigInt(Math.floor(NOW.getTime() / 1000) + 3 * 86400) << 32n).toString();
    for (const id of [early, future]) {
      const url = `https://www.tiktok.com/@a/video/${id}`;
      const fetch = fakeFetch(() => jsonResponse({ title: "Pizza 20 lei" }));
      expect(await loadSource(url, { fetch, now })).toMatchObject({ kind: "text", postedAt: null });
    }
  });

  it("follows a vm. short link to the canonical URL and retries oEmbed once", async () => {
    const short = "https://vm.tiktok.com/ZMabc123/";
    const fetch = fakeFetch((url) => {
      if (url === oembedUrl(short)) return new FetchFailedError("http_status", 400);
      if (url === short) return htmlResponse("<html></html>", `${VIDEO_URL}?_r=1&u_code=x`);
      if (url === oembedUrl(VIDEO_URL)) return jsonResponse({ title: "Ofertă 2+1 la shaorma", author_name: "Scout" });
      throw new Error(`unexpected fetch ${url}`);
    });
    const result = await loadSource(short, { fetch, now });
    expect(result).toMatchObject({ kind: "text", platform: "tiktok", url: short, finalUrl: VIDEO_URL, postedAt: expectedDate, text: "Ofertă 2+1 la shaorma Autor: Scout" });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([oembedUrl(short), short, oembedUrl(VIDEO_URL)]);
  });

  it("gives up when the short link does not lead to TikTok or oEmbed still fails", async () => {
    const short = "https://vt.tiktok.com/ZSabc/";
    const offsite = fakeFetch((url) => (url === short ? htmlResponse("<html></html>", "https://evil.example/x") : new FetchFailedError("http_status", 400)));
    expect(await loadSource(short, { fetch: offsite, now })).toEqual({ kind: "needs_screenshot", url: short, reason: "fetch_failed" });

    const stillFailing = fakeFetch((url) => (url === short ? htmlResponse("<html></html>", VIDEO_URL) : new FetchFailedError("http_status", 400)));
    expect(await loadSource(short, { fetch: stillFailing, now })).toEqual({ kind: "needs_screenshot", url: short, reason: "fetch_failed" });
    expect(stillFailing).toHaveBeenCalledTimes(3);
  });

  it("returns fetch_failed when the page itself cannot be fetched", async () => {
    const fetch = fakeFetch(() => new FetchFailedError("network"));
    expect(await loadSource("https://vm.tiktok.com/ZM1/", { fetch, now })).toEqual({ kind: "needs_screenshot", url: "https://vm.tiktok.com/ZM1/", reason: "fetch_failed" });
  });

  it("asks for a screenshot when the caption is empty", async () => {
    const fetch = fakeFetch(() => jsonResponse({ title: "   ", author_name: "Scout" }));
    expect(await loadSource(VIDEO_URL, { fetch, now })).toEqual({ kind: "needs_screenshot", url: VIDEO_URL, reason: "empty" });
  });

  it("treats malformed oEmbed JSON as a failure", async () => {
    const fetch = fakeFetch(() => ({ url: "https://www.tiktok.com/oembed", status: 200, contentType: "application/json", body: Buffer.from("<html>") }));
    expect(await loadSource(VIDEO_URL, { fetch, now })).toMatchObject({ kind: "needs_screenshot", reason: "fetch_failed" });
  });

  it("drops non-http thumbnail URLs", async () => {
    const fetch = fakeFetch(() => jsonResponse({ title: "Pizza 20 lei", thumbnail_url: "javascript:alert(1)" }));
    expect(await loadSource(VIDEO_URL, { fetch, now })).toMatchObject({ imageUrl: null });
  });

  it("propagates UnsafeUrlError from the fetcher", async () => {
    const fetch = fakeFetch(() => new UnsafeUrlError("private_address"));
    await expect(loadSource(VIDEO_URL, { fetch, now })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("loadSource: pages just under the DOM limits", () => {
  const run = async (html: string) => {
    const fetch = fakeFetch(() => htmlResponse(html, "https://a.example/"));
    const started = performance.now();
    const result = await loadSource("https://a.example/", { fetch, now });
    return { result, ms: performance.now() - started };
  };

  it("skips Readability when depth times elements is too large", async () => {
    const html = `<html><body>${"<div>".repeat(148)}${Array.from({ length: 19_800 }, (_, i) => `<p>w${i}</p>`).join("")}${"</div>".repeat(148)}</body></html>`;
    const { result, ms } = await run(html);
    expect(ms).toBeLessThan(1500);
    expect(result.kind).toBe("text");
  });

  it("keeps script bodies out of the flat text when lowercasing changes the length", async () => {
    const dotted = String.fromCharCode(0x130).repeat(30);
    const html = `<html><body>${dotted}<script>SECRETSCRIPT</script><p>Oferta 25 lei la pizza mare azi.</p>${"<br>".repeat(25_000)}</body></html>`;
    const { result } = await run(html);
    expect(result.kind === "text" && result.text.includes("SECRETSCRIPT")).toBe(false);
  });
});

describe("loadSource: link-heavy pages", () => {
  it.each([
    ["10k linked divs", `<div><a href="/N">x, y</a></div>`.repeat(9990)],
    ["one paragraph of 20k links", `<p>${'<a href="/x">a</a>'.repeat(19_990)}</p>`],
    ["14k hidden divs", '<div style="display:none">x</div>'.repeat(14_000)],
  ])("handles %s quickly", async (_name, body) => {
    const fetch = fakeFetch(() => htmlResponse(`<html><body>${body}</body></html>`, "https://a.example/"));
    const started = performance.now();
    await loadSource("https://a.example/", { fetch, now });
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
