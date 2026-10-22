import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubmitError, submitErrorCode, submitInvalidField, submitRetryAfter } from "./errors";
import { submitDealFlow, type NewDealRow, type SubmitDealDeps, type SubmitDealInput } from "./submit-deal";
import type { DuplicateResult } from "./types";

const NOW = new Date("2026-10-22T12:00:00Z");
const USER = "user-1";
const IMAGE = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";

const draft = {
  restaurantName: "Pizzeria Roma",
  title: "2 pizze la pret de una",
  dealType: "bogo",
  channel: "in_store",
};

function input(overrides: Partial<SubmitDealInput> = {}): SubmitDealInput {
  return { draft, sourceUrl: "https://example.com/promo", imageId: null, extraction: null, ...overrides };
}

type Fakes = {
  deps: SubmitDealDeps;
  inserted: NewDealRow[];
  rateLimit: ReturnType<typeof vi.fn>;
  findDuplicate: ReturnType<typeof vi.fn>;
  imageOwnedBy: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

function setup(
  opts: { duplicate?: DuplicateResult | null; allowed?: boolean; ownsImage?: boolean } = {},
): Fakes {
  const inserted: NewDealRow[] = [];
  const rateLimit = vi.fn(async () =>
    opts.allowed === false ? { allowed: false, retryAfterSeconds: 42 } : { allowed: true, retryAfterSeconds: 0 },
  );
  const findDuplicate = vi.fn(async () => opts.duplicate ?? null);
  const imageOwnedBy = vi.fn(async () => opts.ownsImage ?? true);
  const transaction = vi.fn(async (run) =>
    run({
      lockSource: async () => undefined,
      findDuplicate,
      rateLimit,
      insertDeal: async (row: NewDealRow) => {
        inserted.push(row);
        return DEAL_ID;
      },
    }),
  );
  return { deps: { now: () => NOW, imageOwnedBy, transaction } as SubmitDealDeps, inserted, rateLimit, findDuplicate, imageOwnedBy, transaction };
}

async function failure(promise: Promise<unknown>): Promise<SubmitError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SubmitError);
    return error as SubmitError;
  }
  throw new Error("expected a SubmitError");
}

let f: Fakes;
beforeEach(() => {
  f = setup();
});

describe("submitDealFlow: source", () => {
  it("rejects a signed-out caller", async () => {
    expect((await failure(submitDealFlow(f.deps, null, input()))).message).toBe("unauthorized");
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it("requires a source, before anything else runs", async () => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ sourceUrl: null, imageId: null })));
    expect(error.message).toBe("source_required");
    expect(error.status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.rateLimit).not.toHaveBeenCalled();
    expect(f.inserted).toEqual([]);
  });

  it("rejects a source url that is not http(s)", async () => {
    for (const sourceUrl of ["ftp://example.com/x", "javascript:alert(1)", "not a url"]) {
      expect((await failure(submitDealFlow(f.deps, USER, input({ sourceUrl })))).message).toBe("invalid_url");
    }
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it("rejects a url over 2048 characters", async () => {
    const sourceUrl = `https://example.com/${"a".repeat(2048)}`;
    expect((await failure(submitDealFlow(f.deps, USER, input({ sourceUrl })))).message).toBe("invalid_url");
  });

  it("rejects an image that is not the caller's", async () => {
    f = setup({ ownsImage: false });
    const error = await failure(submitDealFlow(f.deps, USER, input({ sourceUrl: null, imageId: IMAGE })));
    expect(error.message).toBe("image_not_found");
    expect(error.status).toBe(404);
    expect(f.imageOwnedBy).toHaveBeenCalledWith(IMAGE, USER);
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.rateLimit).not.toHaveBeenCalled();
  });

  it("rejects an image id that is not a uuid without asking the database", async () => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ sourceUrl: null, imageId: "nope" })));
    expect(error.message).toBe("image_not_found");
    expect(f.imageOwnedBy).not.toHaveBeenCalled();
  });

  it("accepts an owned image as the only source", async () => {
    const result = await submitDealFlow(f.deps, USER, input({ sourceUrl: null, imageId: IMAGE }));
    expect(result).toEqual({ status: "created", dealId: DEAL_ID });
    expect(f.inserted[0]).toMatchObject({ sourceUrl: null, sourceUrlNormalized: null, imageId: IMAGE });
    expect(f.findDuplicate).not.toHaveBeenCalled();
  });
});

describe("submitDealFlow: draft", () => {
  it("rejects an invalid draft", async () => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: "nonsense" })));
    expect(error.message).toBe("invalid_draft");
    expect(error.status).toBe(400);
    expect(f.rateLimit).not.toHaveBeenCalled();
    expect(f.inserted).toEqual([]);
  });

  it("rejects a missing title and names the field", async () => {
    const { title: _title, ...noTitle } = draft;
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: noTitle })));
    expect(error.message).toBe("invalid_draft:title");
    expect(submitErrorCode(error)).toBe("invalid_draft");
    expect(submitInvalidField(error)).toBe("title");
    expect(f.inserted).toEqual([]);
  });

  it("rejects a null restaurant name (what a failed extraction leaves behind)", async () => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: { ...draft, restaurantName: null } })));
    expect(error.message).toBe("invalid_draft:restaurantName");
  });

  it("rejects a blank title", async () => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: { ...draft, title: "   " } })));
    expect(error.message).toBe("invalid_draft:title");
  });

  it("rejects an expiry that has already passed", async () => {
    const error = await failure(
      submitDealFlow(f.deps, USER, input({ draft: { ...draft, validUntil: "2026-10-22T11:59:00Z" } })),
    );
    expect(error.message).toBe("invalid_draft:validUntil");
  });

  it("defaults validUntil to the end of the Bucharest day a week ahead", async () => {
    await submitDealFlow(f.deps, USER, input());
    expect(f.inserted[0]!.validUntil).toBe("2026-10-29T21:59:59.000Z");
  });

  it("keeps a validUntil the user set, as an ISO instant", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, validUntil: "2026-11-01T23:59:00+02:00" } }));
    expect(f.inserted[0]!.validUntil).toBe("2026-11-01T21:59:00.000Z");
  });

  it("starts the default expiry from a validFrom that is ahead, so it never ends before it starts", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, validFrom: "2026-12-01T08:00:00Z" } }));
    const row = f.inserted[0]!;
    expect(Date.parse(row.validUntil)).toBeGreaterThan(Date.parse(row.validFrom!));
  });

  it("turns blank optional text into null", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, description: "  ", promoCode: "", address: " " } }));
    expect(f.inserted[0]).toMatchObject({ description: null, promoCode: null, address: null });
  });
});

const NUL = String.fromCharCode(0);

describe("submitDealFlow: dates", () => {
  it("clamps a far-future validUntil to 90 days after now (end of the Bucharest day)", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, validUntil: "9999-12-31T23:59:59Z" } }));
    // 2026-10-22 + 90 days = 2027-01-20, 23:59:59 in Bucharest (UTC+2).
    expect(f.inserted[0]!.validUntil).toBe("2027-01-20T21:59:59.000Z");
  });

  it("keeps a validUntil within the limit untouched", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, validUntil: "2026-12-24T10:00:00Z" } }));
    expect(f.inserted[0]!.validUntil).toBe("2026-12-24T10:00:00.000Z");
  });

  it("counts the 90 days from validFrom when that is ahead", async () => {
    await submitDealFlow(
      f.deps,
      USER,
      input({ draft: { ...draft, validFrom: "2026-12-01T00:00:00Z", validUntil: "2099-01-01T00:00:00Z" } }),
    );
    // 2026-12-01 (Bucharest) + 90 days = 2027-03-01, 23:59:59 UTC+2.
    expect(f.inserted[0]!.validUntil).toBe("2027-03-01T21:59:59.000Z");
  });

  it("accepts a validFrom 90 days ahead and rejects one further out", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, validFrom: "2027-01-19T00:00:00Z" } }));
    expect(f.inserted).toHaveLength(1);
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: { ...draft, validFrom: "2027-01-21T00:00:00Z" } })));
    expect(error.message).toBe("invalid_draft:validFrom");
  });

  it.each(["9999-12-31T00:00:00Z", "2100-06-01T00:00:00Z"])("rejects a far-future validFrom %s (not a 500)", async (validFrom) => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: { ...draft, validFrom } })));
    expect(error.message).toBe("invalid_draft:validFrom");
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it.each(["1969-12-31T00:00:00Z", "0001-01-01T00:00:00Z"])("rejects a validFrom before 1970: %s", async (validFrom) => {
    const error = await failure(submitDealFlow(f.deps, USER, input({ draft: { ...draft, validFrom } })));
    expect(error.message).toBe("invalid_draft:validFrom");
  });

  it("never lets the inserted dates leave 1970 to 2100", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, validUntil: "9999-12-31T23:59:59Z" } }));
    for (const value of [f.inserted[0]!.validUntil, f.inserted[0]!.validFrom]) {
      if (value === null) continue;
      expect(Date.parse(value)).toBeGreaterThanOrEqual(Date.UTC(1970, 0, 1));
      expect(Date.parse(value)).toBeLessThan(Date.UTC(2100, 0, 1));
    }
  });
});

describe("submitDealFlow: NUL characters", () => {
  it.each(["restaurantName", "title", "description", "promoCode", "address"] as const)(
    "rejects one in %s as invalid_draft:%s",
    async (field) => {
      const error = await failure(submitDealFlow(f.deps, USER, input({ draft: { ...draft, [field]: `ab${NUL}cd` } })));
      expect(error.message).toBe(`invalid_draft:${field}`);
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );

  it("strips them from the evidence snippet", async () => {
    await submitDealFlow(
      f.deps,
      USER,
      input({ extraction: { evidenceSnippet: `2 pizze${NUL} la pret${NUL}`, confidence: 0.5, source: "text" } }),
    );
    expect(f.inserted[0]!.evidenceSnippet).toBe("2 pizze la pret");
  });
});

describe("submitDealFlow: prices", () => {
  it("computes not_a_discount from the prices and ignores a client flag", async () => {
    await submitDealFlow(
      f.deps,
      USER,
      input({ draft: { ...draft, dealPrice: 30, regularPrice: 25, percentOff: 20, notADiscount: false } }),
    );
    expect(f.inserted[0]).toMatchObject({ notADiscount: true, percentOff: null, dealPrice: 30, regularPrice: 25 });
  });

  it("does not let a client claim not_a_discount on a real discount", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, dealPrice: 10, regularPrice: 25, notADiscount: true } }));
    expect(f.inserted[0]).toMatchObject({ notADiscount: false, percentOff: 60 });
  });

  it("recomputes percentOff from the two prices", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, dealPrice: 15, regularPrice: 30, percentOff: 99 } }));
    expect(f.inserted[0]!.percentOff).toBe(50);
  });

  it("keeps a stated percentage when there is no price pair", async () => {
    await submitDealFlow(f.deps, USER, input({ draft: { ...draft, dealType: "percent_off", percentOff: 25 } }));
    expect(f.inserted[0]).toMatchObject({ percentOff: 25, notADiscount: false });
  });
});

describe("submitDealFlow: dedup and limits", () => {
  it("answers with the existing deal and neither inserts nor uses the limit", async () => {
    f = setup({ duplicate: { status: "duplicate", dealId: DEAL_ID, title: "Already here" } });
    const result = await submitDealFlow(f.deps, USER, input({ sourceUrl: "https://www.example.com/promo?utm_source=ig#x" }));
    expect(result).toEqual({ status: "duplicate", dealId: DEAL_ID, title: "Already here" });
    expect(f.findDuplicate).toHaveBeenCalledWith("https://example.com/promo", NOW);
    expect(f.rateLimit).not.toHaveBeenCalled();
    expect(f.inserted).toEqual([]);
  });

  it("does not insert when rate limited", async () => {
    f = setup({ allowed: false });
    const error = await failure(submitDealFlow(f.deps, USER, input()));
    expect(error.message).toBe("rate_limited:42");
    expect(error.status).toBe(429);
    expect(submitRetryAfter(error)).toBe(42);
    expect(f.inserted).toEqual([]);
  });
});

describe("submitDealFlow: the inserted row", () => {
  it("is published, user-sourced and owned by the caller", async () => {
    const result = await submitDealFlow(f.deps, USER, input());
    expect(result).toEqual({ status: "created", dealId: DEAL_ID });
    expect(f.inserted).toHaveLength(1);
    expect(f.inserted[0]).toMatchObject({
      status: "published",
      sourceType: "user",
      submittedBy: USER,
      extractionSource: "manual",
      evidenceSnippet: null,
      llmConfidence: null,
      restaurantName: "Pizzeria Roma",
      currency: "RON",
    });
  });

  it("succeeds for a manual submission (no extraction) with a source", async () => {
    expect(await submitDealFlow(f.deps, USER, input({ extraction: null }))).toEqual({
      status: "created",
      dealId: DEAL_ID,
    });
  });

  it("stores the url cleaned of credentials and fragment, plus the dedup key", async () => {
    await submitDealFlow(f.deps, USER, input({ sourceUrl: "https://user:pw@www.example.com/promo/?utm_source=x&a=1#top" }));
    expect(f.inserted[0]).toMatchObject({
      sourceUrl: "https://www.example.com/promo/?utm_source=x&a=1",
      sourceUrlNormalized: "https://example.com/promo?a=1",
    });
  });

  it("caps the evidence snippet at 500 characters and clamps the confidence", async () => {
    await submitDealFlow(
      f.deps,
      USER,
      input({ extraction: { evidenceSnippet: `  ${"x".repeat(900)}`, confidence: 7, source: "text" } }),
    );
    expect(f.inserted[0]).toMatchObject({ extractionSource: "text", llmConfidence: 1 });
    expect(f.inserted[0]!.evidenceSnippet).toHaveLength(500);

    await submitDealFlow(f.deps, USER, input({ extraction: { evidenceSnippet: "  ", confidence: -3, source: "image" } }));
    expect(f.inserted[1]).toMatchObject({ extractionSource: "image", llmConfidence: 0, evidenceSnippet: null });
  });

  it("drops a non-finite confidence", async () => {
    await submitDealFlow(f.deps, USER, input({ extraction: { evidenceSnippet: null, confidence: Number.NaN, source: "text" } }));
    expect(f.inserted[0]!.llmConfidence).toBeNull();
  });

  it("passes coordinates and schedule through", async () => {
    await submitDealFlow(
      f.deps,
      USER,
      input({ draft: { ...draft, lat: 44.43, lon: 26.1, timeStart: "22:00", timeEnd: "02:00", daysOfWeek: [5, 6] } }),
    );
    expect(f.inserted[0]).toMatchObject({ lat: 44.43, lon: 26.1, timeStart: "22:00", timeEnd: "02:00", daysOfWeek: [5, 6] });
  });
});
