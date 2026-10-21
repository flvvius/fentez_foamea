import { describe, expect, it } from "vitest";
import type { ScrapedOffer, ValidScrapedOffer } from "@fentezfoamea/core";
import type { Geocoder } from "../src/geocode.ts";
import type { PoliteHttp } from "../src/http.ts";
import { createLogger } from "../src/log.ts";
import { runSource } from "../src/pipeline.ts";
import type { Source, SourceContext } from "../src/source.ts";

const offer = (id: string, venue: Partial<NonNullable<ScrapedOffer["venue"]>> | null): ScrapedOffer => ({
  sourceOfferId: id,
  kind: "discount",
  title: `Ofertă ${id}`,
  url: "https://example.com/oferta",
  venue: venue && { sourceVenueId: `v-${id}`, name: "Bistro", ...venue },
});

function sourceOf(offers: ScrapedOffer[]): Source {
  return {
    id: "bonapp",
    description: "test",
    async *scrape() {
      yield* offers;
    },
  };
}

function context(located: Record<string, { lat: number; lon: number }> = {}): SourceContext {
  const geocoder = { locate: (address: string) => Promise.resolve(located[address]) } as unknown as Geocoder;
  return { http: {} as PoliteHttp, log: createLogger("test"), geocoder, gemini: null, locatedVenueIds: new Set() };
}

async function collect(source: Source, ctx: SourceContext) {
  const written: ValidScrapedOffer[] = [];
  const sink = {
    write: (o: ValidScrapedOffer) => {
      written.push(o);
      return Promise.resolve();
    },
  };
  const summary = await runSource(source, ctx, null, sink);
  return { summary, written };
}

describe("runSource", () => {
  it("rejects invalid offers and venues outside Bucharest", async () => {
    const { summary, written } = await collect(
      sourceOf([
        offer("ok", { lat: 44.43, lon: 26.1 }),
        offer("cluj", { lat: 46.77, lon: 23.6 }),
        { ...offer("bad", null), url: "not a url" },
      ]),
      context(),
    );
    expect(written.map((o) => o.sourceOfferId)).toEqual(["ok"]);
    expect(summary).toMatchObject({ status: "ok", seen: 1, rejected: 2 });
  });

  it("geocodes venues that only have an address and drops duplicates", async () => {
    const { written } = await collect(
      sourceOf([offer("a", { address: "Calea Victoriei 1" }), offer("a", { address: "Calea Victoriei 1" })]),
      context({ "Calea Victoriei 1": { lat: 44.432, lon: 26.097 } }),
    );
    expect(written).toHaveLength(1);
    expect(written[0]?.venue).toMatchObject({ lat: 44.432, lon: 26.097 });
  });

  it("reports a failed run when the source throws", async () => {
    const failing: Source = {
      id: "bonapp",
      description: "test",
      async *scrape() {
        yield offer("first", null);
        throw new Error("HTTP 503");
      },
    };
    const { summary } = await collect(failing, context());
    expect(summary).toMatchObject({ status: "failed", seen: 1, error: "HTTP 503" });
  });
});
