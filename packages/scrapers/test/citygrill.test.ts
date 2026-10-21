import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GeminiExtractor, type GenerateContent } from "../src/gemini.ts";
import type { PoliteHttp } from "../src/http.ts";
import { createLogger } from "../src/log.ts";
import {
  PROMOS,
  citygrill,
  describeMenuPdf,
  findDealPrice,
  menuNames,
  menuPeriod,
  parseTimeWindow,
  promoOffers,
  readPromoPage,
  type Promo,
} from "../src/sources/citygrill.ts";
import type { SourceContext } from "../src/source.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/citygrill/${name}.html`, import.meta.url), "utf8");
const promo = (id: string): Promo => PROMOS.find((candidate) => candidate.id === id)!;
const log = createLogger("test");

describe("readPromoPage", () => {
  it("reads the City Grill lunch menu terms and menu PDF", () => {
    const facts = readPromoPage(fixture("city-grill-pranz"), promo("city-grill-pranz"));
    expect(facts).toMatchObject({
      price: 40.9,
      daysOfWeek: [1, 2, 3, 4, 5],
      timeStart: "11:00",
      timeEnd: "17:00",
      conditions: "Nu se aplică în zilele de sărbătoare legală",
      pdfUrl: "https://citygrill.ro/wp-content/uploads/2026/10/meniu-pranz-octombrie-City-Grill.pdf",
    });
    expect(facts.restaurants.map((r) => r.sourceVenueId)).toEqual([
      "city-grill-primaverii",
      "city-grill-covaci",
      "city-grill-baneasa",
    ]);
  });

  it("skips the dessert surcharge and keeps the lunch price at Caru' cu Bere", () => {
    const facts = readPromoPage(fixture("caru-cu-bere-pranz"), promo("caru-cu-bere-pranz"));
    expect(facts.price).toBeCloseTo(40.9);
    expect(facts.description).toContain("Desert cu 14 lei în plus");
    expect(facts.timeStart).toBe("11:00");
  });

  it("ignores the opening hours in the page chrome", () => {
    const facts = readPromoPage(fixture("city-grill-kozel"), promo("city-grill-kozel"));
    expect(facts.timeStart).toBeUndefined();
    expect(facts.daysOfWeek).toBeUndefined();
    expect(facts.price).toBeCloseTo(11.9);
    expect(facts.pdfUrl).toBeUndefined();
  });

  it("limits a promo to the restaurants the page names", () => {
    const facts = readPromoPage(fixture("city-grill-kozel"), promo("city-grill-kozel"));
    expect(facts.restaurants.map((r) => r.sourceVenueId)).toEqual(["city-grill-covaci"]);
  });

  it("reads the pensioner menu names and terms", () => {
    const facts = readPromoPage(fixture("city-grill-pensionari"), promo("city-grill-pensionari"));
    expect(facts).toMatchObject({ price: 26, timeStart: "16:00", timeEnd: "19:00", daysOfWeek: [1, 2, 3, 4, 5] });
    expect(facts.description).toBe("Meniuri la alegere: Carol, Herăstrău, Cișmigiu. Include o bere sau o limonadă.");
    expect(facts.conditions).toContain("Pe baza talonului de pensie");
  });

  it("falls back to the configured hours when the page words them in prose", () => {
    const facts = readPromoPage(fixture("hanu-berarilor-pensionari"), promo("hanu-berarilor-pensionari"));
    expect(facts).toMatchObject({ price: 26, timeStart: "11:00", timeEnd: "13:00", daysOfWeek: [1, 2, 3, 4, 5] });
  });

  it("reads Tuesday beer until midnight at Uranus only", () => {
    const facts = readPromoPage(fixture("hanu-berarilor-martea-berii"), promo("hanu-berarilor-martea-berii"));
    expect(facts).toMatchObject({ price: 14, daysOfWeek: [2], timeStart: "08:00", timeEnd: "23:59" });
    expect(facts.restaurants.map((r) => r.sourceVenueId)).toEqual(["hanu-berarilor-uranus"]);
  });

  it("describes the 1+1 deal and its conditions", () => {
    const facts = readPromoPage(fixture("city-grill-la-dublu"), promo("city-grill-la-dublu"));
    expect(facts.price).toBeUndefined();
    expect(facts.conditions).toBe(
      "Doar în restaurant, nu la pachet; Al doilea produs este identic cu primul; Nu se aplică în zilele de sărbătoare legală",
    );
  });
});

describe("promoOffers", () => {
  it("emits one offer per restaurant for the current half-month menu", () => {
    const lunch = promo("hanu-berarilor-pranz");
    const offers = promoOffers(lunch, readPromoPage(fixture("city-grill-pranz"), lunch), "2026-10-21");
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      sourceOfferId: "hanu-berarilor-pranz@hanu-berarilor-uranus",
      kind: "daily_menu",
      priceRon: 40.9,
      startsAt: "2026-10-15T21:00:00.000Z",
      endsAt: "2026-10-31T21:59:00.000Z",
      deliveryOnly: false,
      venue: { sourceVenueId: "hanu-berarilor-uranus", chain: "Hanu' Berarilor" },
    });
    expect(offers[0]?.venue).not.toHaveProperty("aliases");
  });

  it("leaves dates off promos that are not menus", () => {
    const kozel = promo("city-grill-kozel");
    const [offer] = promoOffers(kozel, readPromoPage(fixture("city-grill-kozel"), kozel), "2026-10-21");
    expect(offer?.startsAt).toBeUndefined();
    expect(offer?.endsAt).toBeUndefined();
  });
});

describe("helpers", () => {
  it.each([
    ["meniul de pranz este 40,9 lei si cu 14 lei in plus desert", 40.9],
    ["cu 14 lei in plus iti adaugi desert. meniul costa 40,9 lei", 40.9],
    ["meniu pentru varsta de aur - 26 lei", 26],
    ["la pretul de numai 29.90 lei", 29.9],
  ])("finds the deal price in %s", (text, price) => {
    expect(findDealPrice(text)).toBe(price);
  });

  it.each([
    ["intre orele 16:00 s 19:00", ["16:00", "19:00"]],
    ["intre ceasurile 10.00 si 13.00", ["10:00", "13:00"]],
    ["program 10:00 - 24:00, oferta 11:00 - 17:00", ["11:00", "17:00"]],
  ])("parses the window in %s", (text, window) => {
    expect(parseTimeWindow(text)).toEqual(window);
  });

  it("splits the month into the two menu periods", () => {
    expect(menuPeriod("2026-10-03")).toEqual({ startsAt: "2026-09-30T21:00:00.000Z", endsAt: "2026-10-15T20:59:00.000Z" });
    expect(menuPeriod("2026-02-20").endsAt).toBe("2026-02-28T21:59:00.000Z");
  });

  it("title-cases menu names written in capitals", () => {
    expect(menuNames("MENIU CAROL 3 mici Meniul Eminentului Meniu de Curte Veche")).toEqual(["Carol", "Eminentului"]);
  });
});

describe("lunch menu PDF", () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const httpWithPdf = { bytes: vi.fn(() => Promise.resolve(pdf)) } as unknown as PoliteHttp;

  it("returns nothing and downloads nothing without Gemini", async () => {
    const http = { bytes: vi.fn() } as unknown as PoliteHttp;
    const description = await describeMenuPdf({ http, log, gemini: null }, promo("city-grill-pranz"), "https://x/meniu-pranz.pdf");
    expect(description).toBeUndefined();
    expect(http.bytes).not.toHaveBeenCalled();
  });

  it("sends the PDF inline and uses the course list as the description", async () => {
    const generate = vi.fn<GenerateContent>(() =>
      Promise.resolve({
        text: JSON.stringify({
          offers: [{ title: "Meniu de prânz", kind: "daily_menu", description: "Ciorbă de perișoare, șnițel de porc, savarină" }],
        }),
      }),
    );
    const gemini = new GeminiExtractor("test-key", null, log, "gemini-test", generate);

    const description = await describeMenuPdf({ http: httpWithPdf, log, gemini }, promo("city-grill-pranz"), "https://x/meniu-pranz.pdf");

    expect(description).toBe("Ciorbă de perișoare, șnițel de porc, savarină");
    const request = generate.mock.calls[0]![0];
    expect(request.model).toBe("gemini-test");
    expect(JSON.stringify(request.contents)).toContain('"mimeType":"application/pdf"');
    expect(JSON.stringify(request.contents)).toContain(Buffer.from(pdf).toString("base64"));
  });

  it("falls back when Gemini fails", async () => {
    const generate = vi.fn<GenerateContent>(() => Promise.reject(new Error("quota")));
    const gemini = new GeminiExtractor("test-key", null, log, "gemini-test", generate);
    const description = await describeMenuPdf({ http: httpWithPdf, log, gemini }, promo("city-grill-pranz"), "https://x/meniu-pranz.pdf");
    expect(description).toBeUndefined();
  });
});

describe("citygrill source", () => {
  it("keeps going when one page fails and uses the page description without Gemini", async () => {
    const pages = new Map(PROMOS.map((p) => [p.url, p.id]));
    const http = {
      text: vi.fn((url: string) => {
        const id = pages.get(url)!;
        if (id === "city-grill-pranz" || id === "city-grill-kozel") return Promise.resolve(fixture(id));
        return Promise.reject(new Error("HTTP 404"));
      }),
    } as unknown as PoliteHttp;
    const ctx = { http, log, gemini: null } as unknown as SourceContext;

    const offers = [];
    for await (const offer of citygrill.scrape(ctx)) offers.push(offer);

    expect(offers.map((offer) => offer.sourceOfferId)).toEqual([
      "city-grill-pranz@city-grill-primaverii",
      "city-grill-pranz@city-grill-covaci",
      "city-grill-pranz@city-grill-baneasa",
      "city-grill-kozel@city-grill-covaci",
    ]);
    expect(offers[0]?.description).toBe("Meniul se schimbă la începutul și mijlocul lunii.");
  });

  it("fails the run when every page fails", async () => {
    const http = { text: vi.fn(() => Promise.reject(new Error("down"))) } as unknown as PoliteHttp;
    const ctx = { http, log, gemini: null } as unknown as SourceContext;
    const drain = async () => {
      const offers = [];
      for await (const offer of citygrill.scrape(ctx)) offers.push(offer);
      return offers;
    };
    await expect(drain()).rejects.toThrow("Every City Grill group promo page failed");
  });
});
