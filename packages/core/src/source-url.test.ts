import { describe, expect, it } from "vitest";
import { normalizeSourceUrl } from "./source-url.ts";

const n = normalizeSourceUrl;

describe("normalizeSourceUrl: rejects", () => {
  it.each([
    "",
    "   ",
    "not a url",
    "example.com/page",
    "ftp://example.com/file",
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:a@b.ro",
    "file:///etc/passwd",
    "http://",
  ])("%j", (input) => {
    expect(n(input)).toBeNull();
  });
});

describe("normalizeSourceUrl: basics", () => {
  it("treats http and https as the same page", () => {
    expect(n("http://example.com/a")).toBe("https://example.com/a");
    expect(n("http://example.com/a")).toBe(n("https://example.com/a"));
  });

  it("lowercases scheme and host but not the path", () => {
    expect(n("HTTPS://Example.COM/Menu/Pizza")).toBe("https://example.com/Menu/Pizza");
  });

  it("trims surrounding whitespace", () => {
    expect(n("  https://example.com/a \n")).toBe("https://example.com/a");
  });

  it("strips www. and m.", () => {
    expect(n("https://www.example.com/a")).toBe("https://example.com/a");
    expect(n("https://m.example.com/a")).toBe("https://example.com/a");
    expect(n("https://www.m.example.com/a")).toBe("https://example.com/a");
  });

  it("keeps hosts that are just 'm.com' or 'www.ro'", () => {
    expect(n("https://m.com/a")).toBe("https://m.com/a");
    expect(n("https://www.ro/a")).toBe("https://www.ro/a");
  });

  it("only strips the leading label", () => {
    expect(n("https://shop.www.example.com/a")).toBe("https://shop.www.example.com/a");
  });

  it("drops a trailing dot on the host", () => {
    expect(n("https://example.com./a")).toBe("https://example.com/a");
  });

  it("drops the fragment", () => {
    expect(n("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("drops credentials", () => {
    expect(n("https://user:secret@example.com/a")).toBe("https://example.com/a");
  });

  it("drops default ports and keeps the others", () => {
    expect(n("https://example.com:443/a")).toBe("https://example.com/a");
    expect(n("http://example.com:80/a")).toBe("https://example.com/a");
    expect(n("https://example.com:8443/a")).toBe("https://example.com:8443/a");
    expect(n("http://example.com:443/a")).toBe("https://example.com:443/a");
  });

  it("drops a trailing slash except on the root", () => {
    expect(n("https://example.com/a/b/")).toBe("https://example.com/a/b");
    expect(n("https://example.com/")).toBe("https://example.com/");
    expect(n("https://example.com")).toBe("https://example.com/");
    expect(n("https://example.com/a//")).toBe("https://example.com/a");
  });
});

describe("normalizeSourceUrl: query", () => {
  it.each([
    "utm_source=x",
    "utm_medium=y&utm_campaign=z",
    "UTM_Term=1",
    "fbclid=abc",
    "gclid=abc",
    "igsh=abc",
    "igshid=abc",
    "si=abc",
    "ref=home",
    "ref_src=twsrc",
    "_t=abc",
    "_r=1",
    "share_id=5",
    "share_link_id=5",
    "mc_cid=1&mc_eid=2",
  ])("removes tracking: %s", (query) => {
    expect(n(`https://example.com/a?${query}`)).toBe("https://example.com/a");
  });

  it("keeps and sorts the remaining params", () => {
    expect(n("https://example.com/a?z=1&utm_source=x&b=2&a=3")).toBe("https://example.com/a?a=3&b=2&z=1");
  });

  it("makes param order irrelevant", () => {
    expect(n("https://example.com/a?x=1&y=2")).toBe(n("https://example.com/a?y=2&x=1"));
  });

  it("does not drop params that merely contain a tracking name", () => {
    expect(n("https://example.com/a?reference=1&sizing=2")).toBe("https://example.com/a?reference=1&sizing=2");
  });

  it("keeps is_from_webapp and sender_device outside TikTok", () => {
    expect(n("https://example.com/a?is_from_webapp=1&sender_device=pc")).toBe(
      "https://example.com/a?is_from_webapp=1&sender_device=pc",
    );
  });

  it("drops an empty query", () => {
    expect(n("https://example.com/a?")).toBe("https://example.com/a");
    expect(n("https://example.com/a?utm_source=x&")).toBe("https://example.com/a");
  });

  it("identifies the same page with and without tracking and fragment", () => {
    expect(n("https://www.example.com/promo/?utm_source=ig&fbclid=1#top")).toBe(n("https://example.com/promo"));
  });
});

describe("normalizeSourceUrl: plus and %20", () => {
  it("treats + and %20 in the query as the same", () => {
    expect(n("https://example.com/s?q=pizza+roma")).toBe(n("https://example.com/s?q=pizza%20roma"));
    expect(n("https://example.com/s?q=pizza+roma")).toBe("https://example.com/s?q=pizza%20roma");
  });

  it("keeps a literal plus (%2B) apart from a space", () => {
    expect(n("https://example.com/s?q=a%2Bb")).not.toBe(n("https://example.com/s?q=a+b"));
    expect(n("https://example.com/s?q=a%2bb")).toBe("https://example.com/s?q=a%2Bb");
  });

  it("does not touch a plus in the path", () => {
    expect(n("https://example.com/a+b")).toBe("https://example.com/a+b");
  });
});

describe("normalizeSourceUrl: percent-encoding", () => {
  it("uppercases hex digits", () => {
    expect(n("https://example.com/caf%c3%a9")).toBe("https://example.com/caf%C3%A9");
    expect(n("https://example.com/a?q=caf%c3%a9")).toBe("https://example.com/a?q=caf%C3%A9");
  });

  it("decodes escapes of unreserved characters", () => {
    expect(n("https://example.com/%7Euser/%41")).toBe("https://example.com/~user/A");
  });

  it("keeps escapes of reserved characters", () => {
    expect(n("https://example.com/a%2fb")).toBe("https://example.com/a%2Fb");
  });

  it("treats raw and encoded non-ASCII the same", () => {
    expect(n("https://example.com/café")).toBe(n("https://example.com/caf%c3%a9"));
  });
});

describe("normalizeSourceUrl: TikTok", () => {
  it("reduces /@user/video/<id> to the id form", () => {
    expect(n("https://www.tiktok.com/@pizzalover/video/7123456789012345678")).toBe(
      "https://tiktok.com/video/7123456789012345678",
    );
  });

  it("dedupes different user handles and drops the query", () => {
    expect(n("https://www.tiktok.com/@a/video/7123456789012345678?is_from_webapp=1&sender_device=pc&lang=ro")).toBe(
      n("https://m.tiktok.com/@b/video/7123456789012345678/"),
    );
  });

  it("removes is_from_webapp and sender_device on other TikTok urls", () => {
    expect(n("https://www.tiktok.com/@a/photo/1?is_from_webapp=1&sender_device=pc&x=1")).toBe(
      "https://tiktok.com/@a/photo/1?x=1",
    );
  });

  it("leaves vm. and vt. short links as they are (only cleaned)", () => {
    expect(n("https://vm.tiktok.com/ZMabc123/?utm_source=x")).toBe("https://vm.tiktok.com/ZMabc123");
    expect(n("https://vt.tiktok.com/ZSabc123/")).toBe("https://vt.tiktok.com/ZSabc123");
  });
});

describe("normalizeSourceUrl: Instagram", () => {
  it("drops the query from /p/<code> and /reel/<code>", () => {
    expect(n("https://www.instagram.com/p/CxYz_123-ab/?igsh=abc&img_index=2")).toBe("https://instagram.com/p/CxYz_123-ab");
    expect(n("https://www.instagram.com/reel/CxYz_123-ab/?igshid=abc")).toBe("https://instagram.com/reel/CxYz_123-ab");
  });

  it("matches the /<user>/p/<code> variant", () => {
    expect(n("https://www.instagram.com/pizzeria/p/CxYz123/")).toBe(n("https://instagram.com/p/CxYz123?x=1"));
  });

  it("drops the query from /reels/<code> and /tv/<code> too", () => {
    expect(n("https://www.instagram.com/reels/CxYz123/?igsh=abc&utm_source=qr")).toBe("https://instagram.com/reels/CxYz123");
    expect(n("https://www.instagram.com/tv/CxYz123/?hl=ro")).toBe("https://instagram.com/tv/CxYz123");
    expect(n("https://instagram.com/tv/CxYz123/")).toBe(n("https://instagram.com/tv/CxYz123?x=1"));
  });

  it("keeps the code's case", () => {
    expect(n("https://instagram.com/p/AbC")).not.toBe(n("https://instagram.com/p/abc"));
  });

  it("applies the generic rules to other Instagram paths", () => {
    expect(n("https://www.instagram.com/pizzeria/?igsh=x&hl=ro")).toBe("https://instagram.com/pizzeria?hl=ro");
  });
});
