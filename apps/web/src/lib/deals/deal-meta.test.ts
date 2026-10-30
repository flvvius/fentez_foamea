import { describe, expect, it } from "vitest";
import type { DealCard } from "@/server/deals/types";
import { dealMeta } from "./deal-meta";

const deal: DealCard = {
  id: "11111111-1111-4111-8111-111111111111",
  restaurantName: "La Mama",
  title: "Ciorbă + felul doi",
  description: null,
  dealType: "fixed_price",
  dealPrice: 25,
  regularPrice: 40,
  percentOff: 38,
  currency: "RON",
  notADiscount: false,
  daysOfWeek: null,
  timeStart: null,
  timeEnd: null,
  validFrom: null,
  validUntil: "2026-11-01T00:00:00Z",
  channel: "in_store",
  flags: [],
  promoCode: null,
  address: null,
  lat: null,
  lon: null,
  sourceUrl: null,
  imageUrl: null,
  score: 3,
  createdAt: "2026-10-28T10:00:00Z",
  submitterName: "Ana",
};

function tag(meta: ReturnType<typeof dealMeta>["meta"], key: string) {
  return meta.find((entry) => ("property" in entry && entry.property === key) || ("name" in entry && entry.name === key));
}

describe("dealMeta", () => {
  it("names the deal, the place and the price in link previews, with the deal's own image", () => {
    const { meta, links } = dealMeta(deal);
    expect(tag(meta, "og:title")).toMatchObject({ content: "Ciorbă + felul doi la La Mama · 25 lei · −38%" });
    expect(tag(meta, "og:image")).toMatchObject({ content: expect.stringMatching(/\/og\?deal=11111111-/) });
    expect(links[0]).toMatchObject({ rel: "canonical", href: expect.stringMatching(/\/oferta\/11111111-/) });
  });

  it("uses the poster's description when there is one", () => {
    expect(tag(dealMeta({ ...deal, description: "Doar la prânz" }).meta, "description")).toMatchObject({ content: "Doar la prânz" });
    expect(tag(dealMeta(deal).meta, "description")).toMatchObject({ content: expect.stringContaining("la La Mama") });
  });
});
