import { describe, expect, it } from "vitest";
import {
  encodeCursor,
  InvalidCursorError,
  MAX_POPULAR_OFFSET,
  selectFeed,
  type FeedCandidate,
  type FeedParams,
} from "./feed-select";

const now = new Date("2026-10-22T12:00:00Z");
const hours = (h: number) => new Date(now.getTime() - h * 3_600_000);
const future = new Date(now.getTime() + 86_400_000);

type TestDeal = FeedCandidate & { title: string };

let nextId = 0;

function deal(title: string, patch: Partial<TestDeal> = {}): TestDeal {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    title,
    status: "published",
    score: 0,
    createdAt: hours(1),
    validUntil: future,
    ...patch,
  };
}

const ID = "00000000-0000-4000-8000-000000000001";
const base = { now, hideThreshold: -5 };
const titles = (items: TestDeal[]) => items.map((d) => d.title);
const select = (deals: TestDeal[], params: Partial<FeedParams> & { sort: FeedParams["sort"] }) =>
  selectFeed(deals, { ...base, ...params });

describe("selectFeed latest", () => {
  it("orders by created_at desc, then id desc", () => {
    const tie = hours(2);
    const deals = [
      deal("a", { createdAt: hours(5) }),
      deal("b", { createdAt: tie }),
      deal("c", { createdAt: tie }),
      deal("d", { createdAt: hours(1) }),
    ];
    expect(titles(select(deals, { sort: "latest" }).items)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("selectFeed popular", () => {
  it("ranks by time-decayed score", () => {
    const deals = [
      deal("old-hot", { score: 100, createdAt: hours(48) }),
      deal("new-low", { score: 0, createdAt: hours(1) }),
      deal("mid", { score: 10, createdAt: hours(20) }),
      deal("new-down", { score: -3, createdAt: hours(1) }),
    ];
    // relative to now: new-low -0.08, new-down -0.56, mid 1 - 1.6, old-hot 2 - 3.84
    expect(titles(select(deals, { sort: "popular" }).items)).toEqual([
      "new-low",
      "new-down",
      "mid",
      "old-hot",
    ]);
  });

  it("lets enough votes beat recency", () => {
    const deals = [
      deal("fresh", { score: 1, createdAt: hours(1) }),
      deal("popular", { score: 100, createdAt: hours(20) }),
    ];
    // 100 votes = 2 decades = 25h of recency, so a 19h age gap is outweighed
    expect(titles(select(deals, { sort: "popular" }).items)).toEqual(["popular", "fresh"]);
  });

  it("breaks ties by created_at desc then id", () => {
    const deals = [deal("a", { createdAt: hours(3) }), deal("b", { createdAt: hours(3) })];
    expect(titles(select(deals, { sort: "popular" }).items)).toEqual(["b", "a"]);
  });
});

describe("selectFeed visibility", () => {
  const deals = [
    deal("ok"),
    deal("expired", { validUntil: hours(1) }),
    deal("expires-now", { validUntil: now }),
    deal("pending", { status: "pending" }),
    deal("hidden", { status: "hidden" }),
    deal("status-expired", { status: "expired" }),
    deal("at-threshold", { score: -5 }),
    deal("below-threshold", { score: -6 }),
  ];

  it.each(["latest", "popular"] as const)("%s excludes expired, unpublished and below-threshold", (sort) => {
    expect(titles(select(deals, { sort }).items).sort()).toEqual(["at-threshold", "ok"]);
  });

  it("brings a deal back once votes lift it to the threshold", () => {
    const recovered = deals.map((d) => (d.title === "below-threshold" ? { ...d, score: -5 } : d));
    expect(titles(select(recovered, { sort: "latest" }).items)).toContain("below-threshold");
  });
});

describe("selectFeed paging", () => {
  // 25 deals, many sharing a created_at so the id tie-break matters across page boundaries
  const deals = Array.from({ length: 25 }, (_, i) =>
    deal(String.fromCharCode(65 + i), {
      createdAt: hours(Math.floor(i / 3)),
      score: i % 7,
    }),
  );

  it.each(["latest", "popular"] as const)("%s pages without duplicates or gaps", (sort) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = select(deals, { sort, limit: 4, cursor });
      seen.push(...titles(page.items));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 20);

    expect(pages).toBe(7);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(titles(select(deals, { sort, limit: 50 }).items));
    expect(seen).toHaveLength(25);
  });

  it("returns no cursor on the last page", () => {
    expect(select(deals, { sort: "latest", limit: 50 }).nextCursor).toBeNull();
    expect(select(deals.slice(0, 4), { sort: "latest", limit: 4 }).nextCursor).toBeNull();
  });

  it("clamps the limit", () => {
    expect(select(deals, { sort: "latest", limit: 500 }).items).toHaveLength(25);
    expect(select(deals, { sort: "latest", limit: 0 }).items).toHaveLength(1);
  });

  it("rejects a malformed cursor and one for the other sort", () => {
    expect(() => select(deals, { sort: "latest", cursor: "nope" })).toThrow(InvalidCursorError);
    const popularCursor = select(deals, { sort: "popular", limit: 2 }).nextCursor!;
    expect(() => select(deals, { sort: "latest", cursor: popularCursor })).toThrow(InvalidCursorError);
  });

  it.each([
    ["not base64 json", "nope"],
    ["time Date.parse accepts but Postgres doesn't", encodeCursor({ k: "latest", t: "1", id: ID })],
    ["far-future year", encodeCursor({ k: "latest", t: "+275760-09-13T00:00:00.000Z", id: ID })],
    ["no Z suffix", encodeCursor({ k: "latest", t: "2026-10-22T12:00:00", id: ID })],
    ["too many fraction digits", encodeCursor({ k: "latest", t: "2026-10-22T12:00:00.1234567Z", id: ID })],
    ["Feb 30", encodeCursor({ k: "latest", t: "2026-02-30T12:00:00Z", id: ID })],
    ["36 dashes as id", encodeCursor({ k: "latest", t: "2026-10-22T12:00:00Z", id: "-".repeat(36) })],
    ["non-hex id", encodeCursor({ k: "latest", t: "2026-10-22T12:00:00Z", id: ID.replace(/0/g, "g") })],
  ])("rejects a latest cursor with %s", (_label, cursor) => {
    expect(() => select([], { sort: "latest", cursor })).toThrow(InvalidCursorError);
  });

  it("accepts a well-formed latest cursor with microseconds", () => {
    const cursor = encodeCursor({ k: "latest", t: "2026-10-22T12:00:00.123456Z", id: ID });
    expect(() => select([], { sort: "latest", cursor })).not.toThrow();
  });

  it("rejects popular offsets outside 0..MAX", () => {
    for (const o of [-1, MAX_POPULAR_OFFSET + 1, 1.5]) {
      expect(() => select([], { sort: "popular", cursor: encodeCursor({ k: "popular", o }) })).toThrow(
        InvalidCursorError,
      );
    }
  });

  it("stops emitting popular cursors that decodeCursor would reject", () => {
    const many = Array.from({ length: 1100 }, (_, i) => deal(`m${i}`, { score: i % 5 }));
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = select(many, { sort: "popular", limit: 50, cursor });
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 100);
    // offsets 0, 50, ... 1000 are served: 21 pages, then the next offset (1050) is over the cap
    expect(pages).toBe(21);
    expect(cursor).toBeNull();
  });
});
