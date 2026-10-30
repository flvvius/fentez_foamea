import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findDuplicateDeal, findOwnedImage, findVisibleImage, insertDeal, loadImageBytes, pgSubmitDeps, pgUploadDeps } from "./store";
import { submitDealFlow, type NewDealRow } from "./submit-deal";
import { uploadImageFlow } from "./upload-image";

// Runs against the database in DATABASE_URL (the local one), and is skipped without it, as in CI.
// Rows are made for throwaway users that are deleted at the end (their deals, images and
// rate-limit events go with them), or inside a transaction that is rolled back.
const url = process.env.DATABASE_URL;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
const NOW = new Date("2026-10-22T12:00:00Z");
const HOUR = 3_600_000;
const HIDE = -5;

class Rollback extends Error {}

describe.skipIf(!url)("submit store (database)", () => {
  let sql: postgres.Sql;
  // The advisory-lock test needs several connections at once.
  let pool: postgres.Sql;
  const run = randomUUID().slice(0, 8);
  const userId = `t5-it-${run}-a`;
  const otherId = `t5-it-${run}-b`;
  const raceId = `t5-it-${run}-c`;
  const uploaderId = `t5-it-${run}-d`;

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, prepare: false, idle_timeout: 5 });
    pool = postgres(url!, { max: 6, prepare: false, idle_timeout: 5 });
    for (const id of [userId, otherId, raceId, uploaderId]) {
      await sql`insert into auth_user (id, name, email, "emailVerified") values (${id}, 'T5 test', ${`${id}@example.test`}, false)`;
    }
  });

  afterAll(async () => {
    await sql`delete from auth_user where id like ${`t5-it-${run}-%`}`;
    await sql.end();
    await pool.end();
  });

  async function rolledBack<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let result: T | undefined;
    try {
      await sql.begin(async (tx) => {
        result = await fn(tx);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    return result as T;
  }

  type Seed = { status?: string; score?: number; validUntil?: Date; url?: string | null; imageId?: string | null; by?: string };
  async function seedDeal(tx: postgres.TransactionSql, seed: Seed): Promise<string> {
    const url = seed.url === undefined ? null : seed.url;
    const [row] = await tx<{ id: string }[]>`
      insert into deals (status, restaurant_name, title, deal_type, valid_until, channel, source_url, source_url_normalized, image_id, score, submitted_by)
      values (${seed.status ?? "published"}::deal_status, 'Seed', ${`seed ${randomUUID()}`}, 'other', ${seed.validUntil ?? new Date(NOW.getTime() + 24 * HOUR)},
              'in_store', ${url}, ${url}, ${seed.imageId ?? null}, ${seed.score ?? 0}, ${seed.by ?? userId})
      returning id`;
    return row!.id;
  }

  async function seedImage(tx: postgres.TransactionSql, by = userId): Promise<string> {
    const [row] = await tx<{ id: string }[]>`
      insert into deal_images (uploaded_by, mime_type, bytes, byte_size, sha256)
      values (${by}, 'image/png', ${PNG as Buffer}, ${PNG.length}, ${randomUUID()}) returning id`;
    return row!.id;
  }

  describe("findDuplicateDeal", () => {
    const find = (tx: postgres.TransactionSql, key: string) => findDuplicateDeal(tx, key, NOW, HIDE);
    const key = () => `https://example.com/t5-${randomUUID()}`;

    it.each([
      ["a published, live deal", { status: "published", score: 0 }, true],
      ["a published deal exactly at the hide score", { status: "published", score: HIDE }, true],
      ["a published deal below the hide score", { status: "published", score: HIDE - 1 }, false],
      ["a hidden (moderated) deal that has not expired", { status: "hidden", score: 0 }, "blocked"],
      ["a hidden deal with a low score", { status: "hidden", score: -50 }, "blocked"],
      ["a hidden deal that has expired", { status: "hidden", validUntil: new Date(NOW.getTime() - HOUR) }, false],
      ["a published deal that has expired", { status: "published", validUntil: new Date(NOW.getTime() - HOUR) }, false],
      ["a deal whose expiry is exactly now", { status: "published", validUntil: NOW }, false],
      ["an expired-status deal", { status: "expired" }, false],
      ["a pending deal", { status: "pending" }, false],
    ] as [string, Seed, boolean | "blocked"][])("%s %j: blocks a repost = %s", async (_name, seed, blocks) => {
      const found = await rolledBack(async (tx) => {
        const k = key();
        const id = await seedDeal(tx, { ...seed, url: k });
        return { id, result: await find(tx, k).catch((error: unknown) => error) };
      });
      if (blocks === "blocked") expect(String((found.result as Error).message)).toBe("source_blocked");
      else if (blocks) expect(found.result).toMatchObject({ status: "duplicate", dealId: found.id });
      else expect(found.result).toBeNull();
    });

    it("does not match another url", async () => {
      expect(
        await rolledBack(async (tx) => {
          await seedDeal(tx, { url: key() });
          return find(tx, key());
        }),
      ).toBeNull();
    });

    it("answers with the oldest blocking deal, skipping one that does not block", async () => {
      const out = await rolledBack(async (tx) => {
        const k = key();
        await seedDeal(tx, { url: k, score: -20 }); // below threshold: does not block
        const live = await seedDeal(tx, { url: k });
        return { live, result: await find(tx, k) };
      });
      expect(out.result).toMatchObject({ dealId: out.live });
    });
  });

  describe("insertDeal", () => {
    const row: NewDealRow = {
      sourceType: "user",
      status: "published",
      restaurantName: "Pizzeria Mapping",
      title: "Mapping test",
      description: "Two for one",
      dealType: "percent_off",
      dealPrice: 12.5,
      regularPrice: 25,
      percentOff: 50,
      currency: "EUR",
      notADiscount: false,
      daysOfWeek: [5, 6, 7],
      timeStart: "22:00",
      timeEnd: "02:30",
      validFrom: "2026-10-23T08:00:00.000Z",
      validUntil: "2026-11-01T21:59:59.000Z",
      channel: "promo_code",
      flags: ["student", "in_app"],
      promoCode: "PIZZA2",
      address: "Strada Test 1",
      lat: 44.4268,
      lon: 26.1025,
      sourceUrl: "https://www.example.com/map?utm_source=x",
      sourceUrlNormalized: "https://example.com/map",
      imageId: null,
      evidenceSnippet: "2 pizze la pret de una",
      llmConfidence: 0.75,
      extractionSource: "text",
      submittedBy: userId,
    };

    it("writes every column where it belongs", async () => {
      const stored = await rolledBack(async (tx) => {
        const id = await insertDeal(tx, row);
        const [r] = await tx`
          select source_type, status, restaurant_name, title, description, deal_type,
                 deal_price::float8 as deal_price, regular_price::float8 as regular_price, percent_off, currency, not_a_discount,
                 days_of_week, time_start::text as time_start, time_end::text as time_end,
                 valid_from, valid_until, channel, flags, promo_code, address,
                 st_y(location::geometry) as lat, st_x(location::geometry) as lon, st_srid(location::geometry) as srid,
                 source_url, source_url_normalized, image_id, evidence_snippet, llm_confidence, extraction_source, submitted_by, score
          from deals where id = ${id}`;
        return r!;
      });
      expect(stored).toMatchObject({
        source_type: "user",
        status: "published",
        restaurant_name: "Pizzeria Mapping",
        title: "Mapping test",
        description: "Two for one",
        deal_type: "percent_off",
        deal_price: 12.5,
        regular_price: 25,
        percent_off: 50,
        currency: "EUR",
        not_a_discount: false,
        days_of_week: [5, 6, 7],
        time_start: "22:00:00",
        time_end: "02:30:00",
        channel: "promo_code",
        flags: ["student", "in_app"],
        promo_code: "PIZZA2",
        address: "Strada Test 1",
        srid: 4326,
        source_url: "https://www.example.com/map?utm_source=x",
        source_url_normalized: "https://example.com/map",
        image_id: null,
        evidence_snippet: "2 pizze la pret de una",
        extraction_source: "text",
        submitted_by: userId,
        score: 0,
      });
      expect(stored.lat).toBeCloseTo(44.4268, 6);
      expect(stored.lon).toBeCloseTo(26.1025, 6);
      expect(stored.llm_confidence).toBeCloseTo(0.75, 5);
      expect((stored.valid_from as Date).toISOString()).toBe("2026-10-23T08:00:00.000Z");
      expect((stored.valid_until as Date).toISOString()).toBe("2026-11-01T21:59:59.000Z");
    });

    it("stores nulls for everything optional, with an image as the only source", async () => {
      const stored = await rolledBack(async (tx) => {
        const imageId = await seedImage(tx);
        const id = await insertDeal(tx, {
          ...row,
          description: null, dealPrice: null, regularPrice: null, percentOff: null, daysOfWeek: null,
          timeStart: null, timeEnd: null, validFrom: null, promoCode: null, address: null, lat: null, lon: null,
          sourceUrl: null, sourceUrlNormalized: null, imageId, evidenceSnippet: null, llmConfidence: null,
          extractionSource: "manual",
        });
        const [r] = await tx`select description, deal_price, days_of_week, time_start, valid_from, location, source_url, image_id, llm_confidence from deals where id = ${id}`;
        return { r: r!, imageId };
      });
      expect(stored.r).toMatchObject({
        description: null, deal_price: null, days_of_week: null, time_start: null, valid_from: null,
        location: null, source_url: null, image_id: stored.imageId, llm_confidence: null,
      });
    });

    it("is refused by the database without any source", async () => {
      await expect(
        rolledBack((tx) => insertDeal(tx, { ...row, sourceUrl: null, sourceUrlNormalized: null, imageId: null })),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  describe("submit with the advisory lock", () => {
    const draft = { restaurantName: "Race Pizza", title: "Race deal", dealType: "bogo", channel: "in_store" };

    it("lets exactly one of two simultaneous submissions of the same url through", async () => {
      const link = `https://example.com/t5-race-${run}`;
      const attempt = (user: string, suffix: string) =>
        submitDealFlow(pgSubmitDeps(pool, user), user, {
          draft,
          sourceUrl: `${link}${suffix}`,
          imageId: null,
          extraction: null,
        });
      const results = await Promise.all([
        attempt(raceId, ""),
        attempt(otherId, "?utm_source=x"),
        attempt(userId, "/"),
        attempt(uploaderId, "#frag"),
      ]);
      expect(results.filter((r) => r.status === "created")).toHaveLength(1);
      expect(results.filter((r) => r.status === "duplicate")).toHaveLength(3);
      const created = results.find((r) => r.status === "created")!;
      for (const r of results) if (r.status === "duplicate") expect(r.dealId).toBe(created.dealId);
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from deals where source_url_normalized = ${link}`;
      expect(n).toBe(1);
    });

    it("does not use the submit limit for a duplicate", async () => {
      const link = `https://example.com/t5-dup-${run}`;
      const submit = () =>
        submitDealFlow(pgSubmitDeps(pool, raceId), raceId, { draft, sourceUrl: link, imageId: null, extraction: null });
      const [{ before }] = await sql<{ before: number }[]>`select count(*)::int as before from rate_limit_events where user_id = ${raceId} and action = 'submit'`;
      expect((await submit()).status).toBe("created");
      expect((await submit()).status).toBe("duplicate");
      const [{ after }] = await sql<{ after: number }[]>`select count(*)::int as after from rate_limit_events where user_id = ${raceId} and action = 'submit'`;
      expect(after - before).toBe(1);
    });

    it("lets a corrected repost through once the old deal fell below the hide score", async () => {
      const link = `https://example.com/t5-repost-${run}`;
      const submit = () =>
        submitDealFlow(pgSubmitDeps(pool, otherId), otherId, { draft, sourceUrl: link, imageId: null, extraction: null });
      const first = await submit();
      expect(first.status).toBe("created");
      await sql`update deals set score = -50 where id = ${(first as { dealId: string }).dealId}`;
      expect((await submit()).status).toBe("created");
      await sql`update deals set status = 'hidden' where source_url_normalized = ${link}`;
      await expect(submit()).rejects.toThrow("source_blocked");
    });
  });

  describe("uploads and image visibility", () => {
    it("stores an upload once per user and content", async () => {
      const deps = pgUploadDeps(pool, uploaderId);
      const first = await uploadImageFlow(deps, uploaderId, PNG);
      const again = await uploadImageFlow(deps, uploaderId, PNG);
      expect(again).toEqual(first);
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from deal_images where uploaded_by = ${uploaderId}`;
      expect(n).toBe(1);
    });

    it("hands an image only to its uploader for extraction", async () => {
      const out = await rolledBack(async (tx) => {
        const imageId = await seedImage(tx, userId);
        return {
          mine: await findOwnedImage(tx, imageId, userId),
          theirs: await findOwnedImage(tx, imageId, otherId),
        };
      });
      expect(out.mine).toMatchObject({ mimeType: "image/png" });
      expect(out.theirs).toBeNull();
    });

    it.each([
      ["no deal uses it", null, false],
      ["a published, live deal", { status: "published" }, true],
      ["a published deal exactly at the hide score", { status: "published", score: HIDE }, true],
      ["a published deal below the hide score", { status: "published", score: HIDE - 1 }, false],
      ["a hidden deal", { status: "hidden" }, false],
      ["a pending deal", { status: "pending" }, false],
      ["an expired deal", { status: "published", validUntil: new Date(NOW.getTime() - HOUR) }, false],
      ["a deal ending exactly now", { status: "published", validUntil: NOW }, false],
    ] as [string, Seed | null, boolean][])("image behind %s %j: visible = %s", async (_name, seed, visible) => {
      const meta = await rolledBack(async (tx) => {
        const imageId = await seedImage(tx);
        if (seed) await seedDeal(tx, { ...seed, imageId });
        return findVisibleImage(tx, imageId, NOW, HIDE);
      });
      if (visible) expect(meta).toMatchObject({ mimeType: "image/png", sha256: expect.any(String) });
      else expect(meta).toBeNull();
    });

    it("is visible while any of several deals shows it", async () => {
      const meta = await rolledBack(async (tx) => {
        const imageId = await seedImage(tx);
        await seedDeal(tx, { status: "hidden", imageId });
        await seedDeal(tx, { status: "published", imageId });
        return findVisibleImage(tx, imageId, NOW, HIDE);
      });
      expect(meta).not.toBeNull();
    });

    it("reads the stored bytes back unchanged, and nothing for an unknown id", async () => {
      const out = await rolledBack(async (tx) => {
        const imageId = await seedImage(tx);
        return { bytes: await loadImageBytes(tx, imageId), none: await loadImageBytes(tx, randomUUID()) };
      });
      expect([...out.bytes!]).toEqual([...PNG]);
      expect(out.none).toBeNull();
    });
  });
});
