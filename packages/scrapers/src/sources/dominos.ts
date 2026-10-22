import * as cheerio from "cheerio";
import { collapseWhitespace, type ScrapedOffer, type ScrapedVenue } from "@fentezfoamea/core";
import { offersPerStore, withBucharest, type ChainDeal } from "../chain.ts";
import type { Source } from "../source.ts";
import { findLeiPrice, parseDailyWindow, parseValidity, parseWeekdays, truncate } from "../romanian.ts";

const BASE = "https://www.dominos-pizza.ro";
const ADD_ON = /\b(comanzi o pizza|al doilea|a doua)\b/i;

export const dominos: Source = {
  id: "dominos",
  description: "Domino's homepage deals, repeated for each Bucharest store",
  async *scrape({ http, log }) {
    const home = await http.text(`${BASE}/`);
    const storesPage = await http.text(`${BASE}/stores`);
    const offers = dominosOffers(home, storesPage);
    log.info("domino's", { offers: offers.length });
    yield* offers;
  },
};

export function dominosOffers(homeHtml: string, storesHtml: string): ScrapedOffer[] {
  const stores = parseDominosStores(storesHtml);
  return parseDominosDeals(homeHtml).flatMap((deal) =>
    offersPerStore(deal, stores).map((offer) => ({ ...offer, url: offer.venue?.url ?? offer.url })),
  );
}

export function parseDominosDeals(html: string): ChainDeal[] {
  const $ = cheerio.load(html);
  return $(".offer-wrapper")
    .map((_, element): ChainDeal | undefined => {
      const box = $(element);
      const id = box.find("[combo-id]").attr("combo-id")?.trim();
      const title = collapseWhitespace(box.find(".offer-title").text());
      const text = collapseWhitespace(box.find(".offer-txt").text());
      if (!id || !title) return undefined;
      const window = parseDailyWindow(text);
      const price = findLeiPrice(text);
      const addOn = price !== undefined && ADD_ON.test(text);
      return {
        dealId: id,
        kind: "combo",
        title,
        description: text ? truncate(text) : undefined,
        priceRon: addOn ? undefined : price,
        conditions: addOn ? `${formatLei(price)} lei e prețul produsului în plus, doar împreună cu o pizza la preț întreg` : undefined,
        ...parseValidity(text),
        daysOfWeek: parseWeekdays(`${title} ${text}`),
        timeStart: window?.[0],
        timeEnd: window?.[1],
        url: `${BASE}/`,
        deliveryOnly: false,
      };
    })
    .get()
    .filter((deal): deal is ChainDeal => deal !== undefined);
}

export function parseDominosStores(html: string): ScrapedVenue[] {
  const $ = cheerio.load(html);
  return $(".store-wrapper")
    .map((_, element): ScrapedVenue | undefined => {
      const card = $(element);
      const heading = collapseWhitespace(card.find("h3").text());
      const [city, ...rest] = collapseWhitespace(heading).split(" - ");
      if (!city || !/^bucure[sșş]ti$/i.test(city.normalize("NFC")) || rest.length === 0) return undefined;
      const slug = card.find("[data-perma]").attr("data-perma")?.trim();
      const street = collapseWhitespace(card.find(".store-address").text());
      if (!slug) return undefined;
      return {
        sourceVenueId: slug,
        name: `Domino's ${titleCase(rest.join(" - "))}`,
        address: street ? withBucharest(street) : undefined,
        url: `${BASE}/menu/${slug}`,
        chain: "Domino's",
      };
    })
    .get()
    .filter((store): store is ScrapedVenue => store !== undefined);
}

function formatLei(price: number): string {
  return price.toFixed(2).replace(".", ",").replace(/,00$/, "");
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}
