import { collapseWhitespace, isInBucharest, type ScrapedOffer, type OfferKind } from "@fentezfoamea/core";
import { detectConditions, findLeiPrice, foldRomanian, parseWeekdays, truncate } from "../romanian.ts";
import type { Source } from "../source.ts";
import { fetchPageData, richText } from "../sveltekit.ts";

type Entry<T> = { id: number; attributes: T };
type Relation<T> = { data: Entry<T>[] | null } | null;

export type KfcRestaurant = {
  title: string;
  slug: string;
  address?: string | null;
  coordX?: string | null;
  coordY?: string | null;
  public?: boolean | null;
};

export type KfcCity = { name: string; slug: string; restaurants?: Relation<KfcRestaurant> };

export type KfcOffer = {
  slug: string;
  title: string;
  shortText?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  openInApp?: boolean | null;
  showInOffersPage?: boolean | null;
  description?: unknown;
  disclaimer?: unknown;
  restaurante?: Relation<KfcRestaurant>;
};

export type KfcHero = {
  label?: string | null;
  headline?: string | null;
  body?: unknown;
  disclaimer?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  button?: { url?: string | null } | null;
};

export type KfcStore = { id: string; name: string; address?: string; lat: number; lon: number };

export type KfcDeal = {
  slug: string;
  title: string;
  description?: string;
  text: string;
  url: string;
  startsAt?: string;
  endsAt?: string;
  openInApp: boolean;
  storeIds: Set<string> | null;
};

const SITE = "https://kfc.ro";

export const kfc: Source = {
  id: "kfc",
  description: "KFC Romania offers, one per Bucharest restaurant",
  async *scrape({ http, log }) {
    const offersPage = await fetchPageData(http, `${SITE}/ofertepebune`);
    const homePage = await fetchPageData(http, SITE);
    const stores = bucharestStores(cityList(offersPage.cities));
    const offers = entries<KfcOffer>(offersPage.offers);
    const heroes = entries<KfcHero>(dig(homePage, ["homePageData", "data", "attributes", "hero_items"]));
    const now = new Date();
    const deals = [...dealsFromOffers(offers, now), ...dealsFromHeroes(heroes, offers, now)];
    log.info("kfc deals", { deals: deals.length, stores: stores.length });
    for (const deal of deals) yield* dealToOffers(deal, stores);
  },
};

export function cityList(value: unknown): KfcCity[] {
  return entries<KfcCity>(value);
}

export function bucharestStores(cities: KfcCity[]): KfcStore[] {
  return cities.flatMap((city) => entries<KfcRestaurant>(city.restaurants).flatMap((r) => toStore(r) ?? []));
}

export function dealsFromOffers(offers: KfcOffer[], now: Date): KfcDeal[] {
  return offers
    .filter((offer) => offer.showInOffersPage !== false && !hasEnded(offer.endDate, now))
    .map((offer) => {
      const body = richText(offer.description);
      const disclaimer = richText(offer.disclaimer);
      const participating = entries<KfcRestaurant>(offer.restaurante);
      return {
        slug: offer.slug,
        title: collapseWhitespace(offer.title),
        description: pickDescription(offer.title, body, disclaimer, offer.shortText),
        text: [offer.title, offer.shortText, body, disclaimer].filter(Boolean).join("\n"),
        url: `${SITE}/ofertepebune/${offer.slug}`,
        startsAt: isoOrUndefined(offer.startDate),
        endsAt: isoOrUndefined(offer.endDate),
        openInApp: offer.openInApp === true,
        storeIds: participating.length ? new Set(participating.map((r) => r.slug)) : null,
      };
    });
}

export function dealsFromHeroes(heroes: KfcHero[], offers: KfcOffer[], now: Date): KfcDeal[] {
  const offerSlugs = new Set(offers.map((offer) => offer.slug));
  const offerTitles = offers.filter((offer) => !hasEnded(offer.endDate, now)).map((offer) => significantWords(offer.title));
  return heroes.flatMap((hero) => {
    if (!hero.headline || !hero.endDate || hasEnded(hero.endDate, now)) return [];
    const path = hero.button?.url ?? "";
    const slug = path.split("/").findLast(Boolean);
    if (!slug || offerSlugs.has(slug)) return [];
    const body = richText(hero.body);
    const disclaimer = richText(hero.disclaimer);
    const text = [hero.headline, body, disclaimer].join("\n");
    if (findLeiPrice(text) === undefined && !isComboText(text)) return [];
    const heroWords = significantWords(`${hero.headline} ${body}`);
    if (offerTitles.some((words) => [...words].filter((word) => heroWords.has(word)).length >= 2)) return [];
    return [
      {
        slug,
        title: collapseWhitespace(hero.headline),
        description: body ? truncate(body) : undefined,
        text,
        url: new URL(path, SITE).toString(),
        startsAt: isoOrUndefined(hero.startDate),
        endsAt: isoOrUndefined(hero.endDate),
        openInApp: false,
        storeIds: null,
      },
    ];
  });
}

export function dealToOffers(deal: KfcDeal, stores: KfcStore[]): ScrapedOffer[] {
  const conditions = detectConditions(deal.text);
  if (deal.openInApp && !conditions.includes("Doar în aplicație")) conditions.push("Doar în aplicație");
  const daysOfWeek = parseWeekdays(deal.text);
  return stores
    .filter((store) => !deal.storeIds || deal.storeIds.has(store.id))
    .map((store) => ({
      sourceOfferId: `${deal.slug}@${store.id}`,
      kind: classify(deal),
      title: deal.title,
      description: deal.description,
      priceRon: findLeiPrice(deal.text),
      startsAt: deal.startsAt,
      endsAt: deal.endsAt,
      daysOfWeek,
      conditions: conditions.length ? conditions.join("; ") : undefined,
      url: deal.url,
      deliveryOnly: false,
      venue: {
        sourceVenueId: store.id,
        name: store.name,
        address: store.address,
        lat: store.lat,
        lon: store.lon,
        chain: "KFC",
      },
    }));
}

function classify(deal: KfcDeal): OfferKind {
  const folded = foldRomanian(deal.text);
  if (deal.openInApp || /cupon/.test(folded)) return "coupon";
  if (isComboText(deal.text)) return "combo";
  if (/reducere|-\s?\d{1,2}\s?%/.test(folded)) return "discount";
  return "combo";
}

function isComboText(text: string): boolean {
  return /1\s*\+\s*1|din partea casei|inca unul|la dublu|bucket|meniu|menu/.test(foldRomanian(text));
}

function significantWords(text: string): Set<string> {
  return new Set(foldRomanian(text).match(/[a-z0-9]{3,}/g) ?? []);
}

function pickDescription(title: string, body: string, disclaimer: string, shortText?: string | null): string | undefined {
  const titleKey = foldRomanian(title).trim();
  const disclaimerKey = foldRomanian(disclaimer);
  const lines = body
    .split("\n")
    .filter((line) => foldRomanian(line).trim() !== titleKey && !disclaimerKey.includes(foldRomanian(line)));
  const text = lines.join(" ") || shortText || "";
  return text ? truncate(collapseWhitespace(text)) : undefined;
}

function toStore(restaurant: KfcRestaurant): KfcStore | undefined {
  if (restaurant.public === false) return undefined;
  const lat = Number(restaurant.coordX);
  const lon = Number(restaurant.coordY);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInBucharest({ lat, lon })) return undefined;
  return {
    id: restaurant.slug,
    name: collapseWhitespace(restaurant.title),
    address: restaurant.address ? collapseWhitespace(restaurant.address) : undefined,
    lat,
    lon,
  };
}

function entries<T>(value: unknown): T[] {
  const data = (value as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const attributes = (entry as Entry<T> | null)?.attributes;
    return attributes ? [attributes] : [];
  });
}

function dig(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], value);
}

function hasEnded(endDate: string | null | undefined, now: Date): boolean {
  return Boolean(endDate) && new Date(endDate!).getTime() <= now.getTime();
}

function isoOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
