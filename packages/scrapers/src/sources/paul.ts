import * as cheerio from "cheerio";
import { collapseWhitespace, normalizeName, parseRonPrice, type OfferKind, type ScrapedOffer, type ScrapedVenue } from "@fentezfoamea/core";
import { joinConditions, nationalOffer, offersPerStore, withBucharest, type ChainDeal } from "../chain.ts";
import type { Source } from "../source.ts";
import { findLeiPrice, parseDailyWindow, parseValidity, parseWeekdays, truncate } from "../romanian.ts";

const BASE = "https://www.paul.ro";
const LIST_URL = `${BASE}/ro/produsele-noastre/335-paul-offres/`;
const STORES_URL = `${BASE}/ro/our-shops?ajax=1&all=1`;
const MAX_PAGES = 5;

export type PaulDeal = ChainDeal & { onlyAt?: string };

export const paul: Source = {
  id: "paul",
  description: "Paul bakery offers, repeated for each Bucharest bakery",
  async *scrape({ http, log }) {
    const stores = parsePaulStores(await http.text(STORES_URL));
    const urls = new Set<string>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await http.text(page === 1 ? LIST_URL : `${LIST_URL}?p=${page}`);
      const found = parsePaulOfferLinks(html);
      const before = urls.size;
      for (const url of found) urls.add(url);
      if (urls.size === before || !hasNextPage(html, page)) break;
    }
    let count = 0;
    for (const url of urls) {
      const deal = parsePaulDeal(await http.text(url), url);
      if (!deal) continue;
      for (const offer of paulOffers(deal, stores)) {
        count++;
        yield offer;
      }
    }
    log.info("paul", { deals: urls.size, stores: stores.length, offers: count });
  },
};

export function parsePaulOfferLinks(html: string): string[] {
  const $ = cheerio.load(html);
  const links = $("a[href*='/paul-offres/']")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter((href) => /\/paul-offres\/\d+\.html$/.test(href))
    .map((href) => new URL(href, BASE).toString());
  return [...new Set(links)];
}

export function parsePaulStores(xml: string): ScrapedVenue[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("marker")
    .map((_, element): ScrapedVenue | undefined => {
      const marker = $(element);
      const id = marker.attr("id_store");
      const name = collapseWhitespace(marker.attr("name") ?? "");
      const lat = Number(marker.attr("lat"));
      const lon = Number(marker.attr("lng"));
      if (!id || !name) return undefined;
      return {
        sourceVenueId: id,
        name: /paul/i.test(name) ? name.replace(/^paul\b/i, "PAUL") : `${name} (PAUL)`,
        address: storeAddress(marker.attr("address") ?? ""),
        lat: Number.isFinite(lat) && lat !== 0 ? lat : undefined,
        lon: Number.isFinite(lon) && lon !== 0 ? lon : undefined,
        url: `${BASE}/ro/our-shops`,
        chain: "Paul",
      };
    })
    .get()
    .filter((store): store is ScrapedVenue => store !== undefined);
}

export function parsePaulDeal(html: string, url: string): PaulDeal | undefined {
  const $ = cheerio.load(html);
  const title = collapseWhitespace($("h1").first().text());
  const id = /\/(\d+)\.html$/.exec(url)?.[1];
  if (!title || !id) return undefined;
  const short = collapseWhitespace($("#short_description_content").text());
  const details = cleanDetails($("#idTab1 .scrollmobile").text() || $("#idTab1").text());
  const everything = `${short} ${details}`;
  const window = parseDailyWindow(everything);
  const onlyAt = /\bla PAUL((?: [A-ZĂÂÎȘȚ]\p{L}*){1,3})/u.exec(collapseWhitespace(everything))?.[1]?.trim();

  return {
    dealId: id,
    kind: dealKind(title, short),
    title: tidyTitle(title),
    description: truncate(short || details) || undefined,
    priceRon: dealPrice(everything),
    ...parseValidity(details),
    daysOfWeek: parseWeekdays(`${title} ${short}`) ?? parseWeekdays(ownSentences(details)),
    timeStart: window?.[0],
    timeEnd: window?.[1],
    conditions: joinConditions([onlyAt ? `Doar la PAUL ${onlyAt}` : undefined, /în limita stocului/i.test(everything) ? "În limita stocului" : undefined]),
    url,
    deliveryOnly: false,
    onlyAt,
  };
}

export function paulOffers(deal: PaulDeal, stores: ScrapedVenue[]): ScrapedOffer[] {
  const { onlyAt, ...rest } = deal;
  if (!onlyAt) return offersPerStore(rest, stores);
  const wanted = normalizeName(onlyAt);
  const matching = stores.filter((store) => normalizeName(store.name).includes(wanted));
  return matching.length ? offersPerStore(rest, matching) : [nationalOffer(rest)];
}

function hasNextPage(html: string, page: number): boolean {
  return html.includes(`p=${page + 1}`);
}

function dealKind(title: string, text: string): OfferKind {
  if (/pr[aâ]nz/i.test(title)) return "daily_menu";
  if (/\d\s*\+\s*\d|\d\s*x\b|dublu|din partea casei/i.test(`${title} ${text}`)) return "combo";
  if (/meniu|menu|express|d[ée]jeuner|\+/i.test(`${title} ${text}`)) return "combo";
  return "discount";
}

function dealPrice(text: string): number | undefined {
  const clean = collapseWhitespace(text).replace(/(\d) ?([.,]) ?(\d)/g, "$1$2$3");
  const labelled = /pre[tț] ?:? ?(\d+(?:[.,]\d{1,2})?) ?lei/i.exec(clean);
  return labelled ? parseRonPrice(labelled[1]) : findLeiPrice(clean);
}

function cleanDetails(text: string): string {
  return collapseWhitespace(text)
    .replace(/^Notre produit\s*/i, "")
    .replace(/Vezi detalii:.*$/i, "")
    .replace(/Imaginile sunt cu titlu de prezentare[^.]*\./gi, "")
    .trim();
}

function ownSentences(text: string): string {
  return text
    .split(/(?<=[.!])\s/)
    .filter((sentence) => !/nu se cumuleaz|nu (?:este|e) (?:disponibil|valabil)/i.test(sentence))
    .join(" ");
}

function tidyTitle(title: string): string {
  return title === title.toUpperCase() ? title.charAt(0) + title.slice(1).toLowerCase() : title;
}

function storeAddress(raw: string): string | undefined {
  const lines = raw
    .split(/<br\s*\/?>/i)
    .map((line) => collapseWhitespace(line))
    .filter((line) => line && !/^[\d.\s+]+$/.test(line));
  return lines.length ? withBucharest(lines.filter((line) => !/^bucure[sșş]ti$/i.test(line)).join(", ")) : undefined;
}
