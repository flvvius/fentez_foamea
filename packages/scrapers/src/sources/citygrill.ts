import * as cheerio from "cheerio";
import {
  bucharestLocalToIso,
  bucharestToday,
  collapseWhitespace,
  parseRonPrice,
  type OfferKind,
  type ScrapedOffer,
  type ScrapedVenue,
} from "@fentezfoamea/core";
import type { GeminiExtractor } from "../gemini.ts";
import { foldRomanian, parseWeekdays, truncate } from "../romanian.ts";
import type { Source, SourceContext } from "../source.ts";

export type Restaurant = ScrapedVenue & { aliases: string[] };

type Schedule = { daysOfWeek?: number[]; timeStart?: string; timeEnd?: string };

export type Promo = {
  id: string;
  url: string;
  kind: OfferKind;
  title: string;
  restaurants: Restaurant[];
  fallback?: Schedule;
  menuPdf?: boolean;
};

export type PromoFacts = Schedule & {
  price?: number;
  description?: string;
  conditions?: string;
  restaurants: Restaurant[];
  pdfUrl?: string;
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const LUNCH: Schedule = { daysOfWeek: WEEKDAYS, timeStart: "11:00", timeEnd: "17:00" };

const CITY_GRILL: Restaurant[] = [
  {
    sourceVenueId: "city-grill-primaverii",
    name: "City Grill Primăverii",
    chain: "City Grill",
    address: "Bulevardul Primăverii 3, București",
    lat: 44.4670063,
    lon: 26.0877298,
    url: "https://citygrill.ro/",
    aliases: ["primaverii"],
  },
  {
    sourceVenueId: "city-grill-covaci",
    name: "City Grill Covaci",
    chain: "City Grill",
    address: "Strada Covaci 19, București",
    lat: 44.4304086,
    lon: 26.1026456,
    url: "https://citygrill.ro/",
    aliases: ["covaci"],
  },
  {
    sourceVenueId: "city-grill-baneasa",
    name: "City Grill Băneasa",
    chain: "City Grill",
    address: "Băneasa Shopping City, etaj 1, Șoseaua București-Ploiești 42D, București",
    lat: 44.5072589,
    lon: 26.0894851,
    url: "https://citygrill.ro/",
    aliases: ["baneasa"],
  },
];

const CARU_CU_BERE: Restaurant[] = [
  {
    sourceVenueId: "caru-cu-bere",
    name: "Caru' cu Bere",
    chain: "Caru' cu Bere",
    address: "Strada Stavropoleos 5, București",
    lat: 44.4320009,
    lon: 26.0981059,
    url: "https://www.carucubere.ro/",
    aliases: [],
  },
];

const HANU_BERARILOR: Restaurant[] = [
  {
    sourceVenueId: "hanu-berarilor-uranus",
    name: "Hanu' Berarilor Uranus",
    chain: "Hanu' Berarilor",
    address: "Calea Rahovei 157A, București",
    lat: 44.4211522,
    lon: 26.0862491,
    url: "https://hanuberarilor.ro/",
    aliases: ["uranus"],
  },
  {
    sourceVenueId: "hanu-berarilor-casa-oprea-soare",
    name: "Hanu' Berarilor Casa Oprea Soare",
    chain: "Hanu' Berarilor",
    address: "Strada Poenaru Bordea 2, București",
    lat: 44.4286208,
    lon: 26.0956336,
    url: "https://hanuberarilor.ro/",
    aliases: ["oprea soare", "casa soare"],
  },
  {
    sourceVenueId: "hanu-berarilor-elena-lupescu",
    name: "Hanu' Berarilor Casa Elena Lupescu",
    chain: "Hanu' Berarilor",
    address: "Bulevardul Pache Protopopescu 51, București",
    lat: 44.439572,
    lon: 26.1238869,
    url: "https://hanuberarilor.ro/",
    aliases: ["lupescu"],
  },
];

export const PROMOS: Promo[] = [
  {
    id: "city-grill-pranz",
    url: "https://citygrill.ro/promotii/meniu-savuros-de-pranz/",
    kind: "daily_menu",
    title: "Meniu de prânz",
    restaurants: CITY_GRILL,
    fallback: LUNCH,
    menuPdf: true,
  },
  {
    id: "city-grill-la-dublu",
    url: "https://citygrill.ro/promotii/la-dublu/",
    kind: "combo",
    title: "1+1 la produse selectate",
    restaurants: CITY_GRILL,
  },
  {
    id: "city-grill-studenti",
    url: "https://citygrill.ro/promotii/meniu-studenti/",
    kind: "discount",
    title: "Meniu de student",
    restaurants: CITY_GRILL,
  },
  {
    id: "city-grill-pensionari",
    url: "https://citygrill.ro/promotii/meniuri-pentru-varsta-de-aur/",
    kind: "discount",
    title: "Meniu pentru pensionari",
    restaurants: CITY_GRILL,
  },
  {
    id: "city-grill-kozel",
    url: "https://citygrill.ro/promotii/oferta-kozel-city-grill/",
    kind: "discount",
    title: "Halbă Kozel 400 ml",
    restaurants: CITY_GRILL,
  },
  {
    id: "caru-cu-bere-pranz",
    url: "https://www.carucubere.ro/meniu/oferte/meniuri-de-pranz/",
    kind: "daily_menu",
    title: "Meniu de prânz",
    restaurants: CARU_CU_BERE,
    fallback: LUNCH,
    menuPdf: true,
  },
  {
    id: "caru-cu-bere-la-dublu",
    url: "https://www.carucubere.ro/oferte-la-dublu/",
    kind: "combo",
    title: "1+1 la produse selectate",
    restaurants: CARU_CU_BERE,
  },
  {
    id: "caru-cu-bere-studenti",
    url: "https://www.carucubere.ro/meniu-studenti/",
    kind: "discount",
    title: "Meniu de student",
    restaurants: CARU_CU_BERE,
  },
  {
    id: "caru-cu-bere-pensionari",
    url: "https://www.carucubere.ro/meniu/oferte/meniuri-pensionari/",
    kind: "discount",
    title: "Meniu pentru pensionari",
    restaurants: CARU_CU_BERE,
  },
  {
    id: "hanu-berarilor-pranz",
    url: "https://hanuberarilor.ro/promotii/hai-la-o-pranzeala/",
    kind: "daily_menu",
    title: "Meniu de prânz",
    restaurants: HANU_BERARILOR,
    fallback: LUNCH,
    menuPdf: true,
  },
  {
    id: "hanu-berarilor-la-dublu",
    url: "https://hanuberarilor.ro/promotii/oferte-la-dublu/",
    kind: "combo",
    title: "1+1 la produse selectate",
    restaurants: HANU_BERARILOR,
  },
  {
    id: "hanu-berarilor-studenti",
    url: "https://hanuberarilor.ro/promotii/meniu-de-studenti/",
    kind: "discount",
    title: "Meniu de student",
    restaurants: HANU_BERARILOR,
  },
  {
    id: "hanu-berarilor-pensionari",
    url: "https://hanuberarilor.ro/promotii/meniu-de-pensionari-bucuresti/",
    kind: "discount",
    title: "Meniu pentru seniori",
    restaurants: HANU_BERARILOR,
    fallback: { daysOfWeek: WEEKDAYS, timeStart: "11:00", timeEnd: "13:00" },
  },
  {
    id: "hanu-berarilor-martea-berii",
    url: "https://hanuberarilor.ro/promotii/martea-berii/",
    kind: "happy_hour",
    title: "Marțea berii: orice bere la preț fix",
    restaurants: HANU_BERARILOR,
    fallback: { daysOfWeek: [2] },
  },
];

const PRICED_KINDS = new Set<OfferKind>(["discount", "happy_hour"]);

const MENU_HINT =
  "This PDF is a fixed-price lunch menu. Return one daily_menu offer whose description lists the dishes, comma separated, in Romanian, at most 200 characters.";

export const citygrill: Source = {
  id: "citygrill",
  description: "City Grill group promos: City Grill, Caru' cu Bere, Hanu' Berarilor",
  async *scrape(ctx) {
    let failures = 0;
    for (const promo of PROMOS) {
      let facts: PromoFacts;
      try {
        facts = readPromoPage(await ctx.http.text(promo.url), promo);
      } catch (error) {
        failures++;
        ctx.log.warn("promo page failed", { url: promo.url, error: String(error) });
        continue;
      }
      if (PRICED_KINDS.has(promo.kind) && facts.price === undefined) {
        ctx.log.warn("promo without price, skipping", { url: promo.url });
        continue;
      }
      const menu = promo.menuPdf && facts.pdfUrl ? await describeMenuPdf(ctx, promo, facts.pdfUrl) : undefined;
      yield* promoOffers(promo, { ...facts, description: menu ?? facts.description });
    }
    if (failures === PROMOS.length) throw new Error("Every City Grill group promo page failed");
  },
};

export function readPromoPage(html: string, promo: Promo): PromoFacts {
  const $ = cheerio.load(html);
  const text = contentText($);
  const folded = foldRomanian(text);
  const window = parseTimeWindow(folded);
  const days = parseWeekdays(text);
  const named = promo.restaurants.filter((restaurant) => restaurant.aliases.some((alias) => folded.includes(alias)));

  return {
    price: findDealPrice(folded),
    daysOfWeek: days ?? promo.fallback?.daysOfWeek,
    timeStart: window?.[0] ?? promo.fallback?.timeStart,
    timeEnd: window?.[1] ?? promo.fallback?.timeEnd,
    description: describePromo(promo.kind, text),
    conditions: findConditions(folded),
    restaurants: named.length ? named : promo.restaurants,
    pdfUrl: findMenuPdf($, promo.url),
  };
}

export function promoOffers(promo: Promo, facts: PromoFacts, today = bucharestToday()): ScrapedOffer[] {
  const period = promo.kind === "daily_menu" ? menuPeriod(today) : undefined;
  return facts.restaurants.map(({ aliases: _aliases, ...venue }) => ({
    sourceOfferId: `${promo.id}@${venue.sourceVenueId}`,
    kind: promo.kind,
    title: promo.title,
    description: facts.description,
    priceRon: facts.price,
    daysOfWeek: facts.daysOfWeek,
    timeStart: facts.timeStart,
    timeEnd: facts.timeEnd,
    startsAt: period?.startsAt,
    endsAt: period?.endsAt,
    conditions: facts.conditions,
    url: promo.url,
    deliveryOnly: false,
    venue,
  }));
}

export async function describeMenuPdf(
  ctx: Pick<SourceContext, "http" | "log"> & { gemini: Pick<GeminiExtractor, "extractOffersFromPdf"> | null },
  promo: Promo,
  pdfUrl: string,
): Promise<string | undefined> {
  if (!ctx.gemini) return undefined;
  try {
    const pdf = await ctx.http.bytes(pdfUrl);
    const offers = await ctx.gemini.extractOffersFromPdf(pdf, {
      venueName: promo.restaurants[0]?.chain ?? promo.title,
      url: pdfUrl,
      hint: MENU_HINT,
    });
    const menu = offers.find((offer) => offer.kind === "daily_menu" && offer.description) ?? offers.find((offer) => offer.description);
    return menu?.description ? truncate(collapseWhitespace(menu.description)) : undefined;
  } catch (error) {
    ctx.log.warn("lunch menu pdf extraction failed", { url: pdfUrl, error: String(error) });
    return undefined;
  }
}

export function contentText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg").remove();
  $("br").replaceWith(" ");
  for (const selector of ["#Content .column_attr", ".internal-page-header, .internal-page-content", "main", "body"]) {
    const blocks = $(selector)
      .map((_, element) => collapseWhitespace($(element).text()))
      .get()
      .filter(Boolean);
    if (blocks.length) return [...new Set(blocks)].join("\n");
  }
  return "";
}

export function findDealPrice(folded: string): number | undefined {
  const patterns = [
    /(?:la doar|doar|numai|este|pretul de)\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:lei|ron)\b/,
    /[-–]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*lei\b/,
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:lei|ron)\b(?!\s*in plus)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(folded);
    if (match?.[1]) return parseRonPrice(match[1]);
  }
  return undefined;
}

export function parseTimeWindow(folded: string): [string, string] | undefined {
  const untilMidnight = /ora (\d{1,2})[:.](\d{2}) (?:si )?pana la miezul noptii/.exec(folded);
  if (untilMidnight) {
    const start = clock(untilMidnight[1], untilMidnight[2]);
    return start ? [start, "23:59"] : undefined;
  }
  for (const match of folded.matchAll(/(\d{1,2})[:.](\d{2}) ?(?:si|s|[-–]|pana la) ?-? ?(\d{1,2})[:.](\d{2})/g)) {
    const start = clock(match[1], match[2]);
    const end = clock(match[3], match[4]);
    if (start && end && start < end) return [start, end];
  }
  return undefined;
}

export function menuPeriod(today: string): { startsAt?: string; endsAt?: string } {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const [from, to] = day <= 15 ? [1, 15] : [16, lastDay];
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return {
    startsAt: bucharestLocalToIso(`${prefix}-${String(from).padStart(2, "0")}`, "00:00"),
    endsAt: bucharestLocalToIso(`${prefix}-${String(to).padStart(2, "0")}`, "23:59"),
  };
}

function describePromo(kind: OfferKind, text: string): string | undefined {
  const folded = foldRomanian(text);
  if (kind === "combo") {
    return /cumperi un produs/.test(folded) ? "Cumperi un produs și primești încă unul la fel din partea casei." : undefined;
  }
  if (kind === "daily_menu") {
    const dessert = /(\d{1,3}(?:[.,]\d{1,2})?) ?lei ?in plus/.exec(folded);
    const parts = ["Meniul se schimbă la începutul și mijlocul lunii."];
    if (dessert?.[1]) parts.push(`Desert cu ${dessert[1]} lei în plus.`);
    return parts.join(" ");
  }
  if (kind === "discount") {
    const names = menuNames(text);
    const drink = /(gratuit|din partea casei|includ o bautura|includ).{0,60}(bere|limonada|bautura)/.test(folded);
    const parts: string[] = [];
    if (names.length) parts.push(`Meniuri la alegere: ${names.join(", ")}.`);
    if (drink) parts.push("Include o bere sau o limonadă.");
    if (parts.length) return truncate(parts.join(" "));
  }
  const sentence = text.split(/(?<=[.!])\s+/).find((part) => /\d\s*lei/i.test(part));
  return sentence ? truncate(collapseWhitespace(sentence)) : undefined;
}

const NOT_MENU_NAMES = new Set(["de", "pentru", "la", "studenti", "pranz", "complet"]);

export function menuNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\b(?:Meniu|MENIU)[lL]?\s([A-ZĂÂÎȘȚŞŢ]\p{L}+)/gu)) {
    const name = match[1]!;
    if (NOT_MENU_NAMES.has(foldRomanian(name))) continue;
    const pretty = name === name.toUpperCase() && name.length > 3 ? titleCase(name) : name;
    if (!names.includes(pretty)) names.push(pretty);
  }
  return names;
}

function findConditions(folded: string): string | undefined {
  const conditions: string[] = [];
  if (/carnet(ul|ului)? de student|legitimatia de student/.test(folded)) conditions.push("Pe baza carnetului de student");
  if (/talon(ul|ului)? de pensie/.test(folded)) conditions.push("Pe baza talonului de pensie");
  if (/nu se pot comanda la pachet|doar in restaurant/.test(folded)) conditions.push("Doar în restaurant, nu la pachet");
  if (/identic cu cel comandat/.test(folded)) conditions.push("Al doilea produs este identic cu primul");
  if (/sarbatoare legala|sarbatori legale/.test(folded)) conditions.push("Nu se aplică în zilele de sărbătoare legală");
  return conditions.length ? conditions.join("; ") : undefined;
}

function findMenuPdf($: cheerio.CheerioAPI, pageUrl: string): string | undefined {
  const href = $("a[href]")
    .map((_, element) => $(element).attr("href"))
    .get()
    .find((link) => /\.pdf$/i.test(link) && /meniu/i.test(link) && /pranz/i.test(foldRomanian(link)));
  return href ? new URL(href, pageUrl).toString() : undefined;
}

function clock(hours: string | undefined, minutes: string | undefined): string | undefined {
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());
}
