import { bucharestGrid, collapseWhitespace, fromMinorUnits, type LatLon, type OfferKind, type ScrapedOffer, type ScrapedVenue } from "@fentezfoamea/core";
import { HttpError } from "../http.ts";
import type { Logger } from "../log.ts";
import type { Source } from "../source.ts";
import { sleep } from "../throttle.ts";

export type WoltListVenue = {
  id: string;
  slug: string;
  name: string;
  address?: string;
  location: [number, number];
  rating?: { volume?: number } | null;
};

type WoltListPage = { sections: { items?: { venue?: WoltListVenue }[] }[] };

type WoltBasketCondition = {
  min_amount: number | null;
  any_of_items: string[] | null;
  items_from_categories: string[] | null;
};

export type WoltCampaign = {
  id: string;
  effects: {
    basket_discount: { amount: number | null; fraction: number | null } | null;
    delivery_discount: { amount: number | null; fraction: number | null } | null;
    free_items: unknown;
    item_discount: {
      fraction: number | null;
      amount_per_item: number | null;
      include: { categories: string[] | null; items: string[] | null } | null;
    } | null;
  };
  conditions: {
    basket_contains: WoltBasketCondition[] | null;
    delivery_methods: string[] | null;
    max_distance: number | null;
    weekly_time_restrictions: { start: number; end: number }[] | null;
    has_wolt_plus: boolean | null;
  };
  description: { title: string; points: string[] };
  end_date: string | null;
};

type WoltDynamic = { venue_raw: { discounts: WoltCampaign[] } };

export type WoltAssortment = {
  categories: { id: string; item_ids: string[] }[];
  items: { id: string; name: string; price: number; disabled_info: unknown; is_wolt_plus_only?: boolean }[];
};

type QueuedVenue = WoltListVenue & { foundAt: LatLon };

const API = "https://consumer-api.wolt.com";
const SITE = "https://wolt.com/ro/rou/bucharest/restaurant";
const GRID_SPACING_METERS = 7000;
const MAX_VENUES = Number(process.env.WOLT_MAX_VENUES ?? 600);
const ROTATION_SLOT_MS = 4 * 60 * 60 * 1000;
const MAX_ASSORTMENTS = Number(process.env.WOLT_MAX_ASSORTMENTS ?? 120);
const ITEMS_PER_VENUE = 5;
const LUNCH_ITEMS_PER_VENUE = 3;
const PRICE_CAP = /\bsub\s+(\d{1,3})\s*lei\b/i;
const MIN_ITEM_PRICE = 1500;
const OPEN_ENDED_YEAR = 2049;
const LIST_PAUSE_MS = 8000;
const RATE_LIMIT_COOLDOWNS_MS = [20_000, 45_000, 90_000];
const HEADERS = { "App-Language": "ro" };

const PLATFORM_WIDE = /utilizatorii noi|new users|prima comand|first order/i;
const DELIVERY_FEE_ONLY = /^(?:0 (?:RON|lei) taxă de livrare|livrare gratuită|free delivery)$/i;
const WOLT_PLUS_UPSELL = /\b(cu|with) W(olt)?\+/i;
const WOLT_PLUS_TAIL = /\s*\|[^|]*\b(cu|with) W(olt)?\+.*$/i;
const ALL_ITEMS = /toate articolele|all items/i;

const CHAINS = [
  "McDonald's",
  "KFC",
  "Burger King",
  "Pizza Hut",
  "Domino's",
  "Dodo Pizza",
  "Taco Bell",
  "Subway",
  "Starbucks",
  "Spartan",
  "Popeyes",
  "Paul",
  "Noodle Pack",
  "5 to go",
  "Chopstix",
  "Jerry's Pizza",
  "Salad Box",
  "City Grill",
  "Ciorbe și Plăcinte",
  "La Mama",
  "Mesopotamia",
  "Papa Gyros",
  "Dristor Kebap",
  "Shaormeria Băneasa",
];

export const wolt: Source = {
  id: "wolt",
  description: "Wolt merchant campaigns and discounted items",
  rotating: { idPattern: "%", keepHours: 48 },
  async *scrape({ http, log }) {
    const venues = await collectVenues(async (point) => {
      const url = `${API}/v1/pages/restaurants?lat=${point.lat}&lon=${point.lon}`;
      const page = await patiently(log, () => http.json<WoltListPage>(url, { headers: HEADERS }));
      await sleep(LIST_PAUSE_MS);
      return page;
    });
    const queue = rotationWindow(prioritise(venues), MAX_VENUES, rotationSlot(new Date()));
    log.info("wolt venues", { unique: venues.size, checking: queue.length, skipped: venues.size - queue.length });

    let assortments = 0;
    for (const venue of queue) {
      const dynamic = await fetchOptional(log, () =>
        http.json<WoltDynamic>(
          `${API}/order-xp/web/v1/venue/slug/${venue.slug}/dynamic/?lat=${venue.foundAt.lat}&lon=${venue.foundAt.lon}&selected_delivery_method=homedelivery`,
          { headers: HEADERS },
        ),
      );
      const campaigns = (dynamic?.venue_raw.discounts ?? []).filter(isMerchantCampaign);
      if (campaigns.length === 0) continue;

      const lunches = campaigns.filter(isLunchWithListedItems);
      for (const campaign of campaigns) if (!lunches.includes(campaign)) yield campaignOffer(venue, campaign);

      const needsMenu = lunches.length > 0 || campaigns.some((campaign) => campaign.effects.item_discount);
      let assortment: WoltAssortment | undefined;
      if (needsMenu && assortments < MAX_ASSORTMENTS) {
        assortments++;
        assortment = await fetchOptional(log, () =>
          http.json<WoltAssortment>(`${API}/consumer-api/consumer-assortment/v1/venues/slug/${venue.slug}/assortment?language=ro`, {
            headers: HEADERS,
          }),
        );
      }
      if (assortment) yield* itemOffers(venue, campaigns, assortment);
      for (const lunch of lunches) {
        const items = assortment ? lunchItemOffers(venue, lunch, assortment) : [];
        if (items.length) yield* items;
        else yield campaignOffer(venue, lunch);
      }
    }
    log.info("wolt assortments", { fetched: assortments, cap: MAX_ASSORTMENTS });
  },
};

export async function collectVenues(fetchPage: (point: LatLon) => Promise<WoltListPage>): Promise<Map<string, QueuedVenue>> {
  const venues = new Map<string, QueuedVenue>();
  for (const point of bucharestGrid(GRID_SPACING_METERS)) {
    const page = await fetchPage(point);
    for (const venue of listVenues(page)) {
      if (!venues.has(venue.id)) venues.set(venue.id, { ...venue, foundAt: point });
    }
  }
  return venues;
}

export function listVenues(page: WoltListPage): WoltListVenue[] {
  return page.sections.flatMap((section) => section.items ?? []).flatMap((item) => (item.venue?.slug ? [item.venue] : []));
}

export function prioritise(venues: Map<string, QueuedVenue>): QueuedVenue[] {
  return [...venues.values()].sort((a, b) => (b.rating?.volume ?? 0) - (a.rating?.volume ?? 0) || a.id.localeCompare(b.id));
}

export function rotationSlot(now: Date): number {
  return Math.floor(now.getTime() / ROTATION_SLOT_MS);
}

export function rotationWindow<T>(items: T[], size: number, slot: number): T[] {
  if (items.length <= size) return items;
  const start = (slot * size) % items.length;
  return [...items.slice(start), ...items.slice(0, start)].slice(0, size);
}

export function isMerchantCampaign(campaign: WoltCampaign): boolean {
  if (campaign.conditions.has_wolt_plus === true) return false;
  if (DELIVERY_FEE_ONLY.test(campaign.description.title.trim())) return false;
  return !campaign.description.points.some((point) => PLATFORM_WIDE.test(point));
}

export function withoutWoltPlusUpsell(title: string): string {
  return title.replace(WOLT_PLUS_TAIL, "") || title;
}

export function campaignOffer(venue: WoltListVenue, campaign: WoltCampaign): ScrapedOffer {
  return {
    sourceOfferId: `${campaign.id}@${venue.id}`,
    kind: campaignKind(campaign),
    title: withoutWoltPlusUpsell(collapseWhitespace(campaign.description.title)),
    endsAt: endDate(campaign),
    ...weeklySchedule(campaign.conditions.weekly_time_restrictions),
    conditions: campaignConditions(campaign),
    url: venueUrl(venue),
    deliveryOnly: true,
    venue: toVenue(venue),
  };
}

export function itemOffers(venue: WoltListVenue, campaigns: WoltCampaign[], assortment: WoltAssortment): ScrapedOffer[] {
  const itemsById = new Map(assortment.items.map((item) => [item.id, item]));
  const categoryItems = new Map(assortment.categories.map((category) => [category.id, category.item_ids]));
  const best = new Map<string, { campaign: WoltCampaign; price: number; original: number; name: string }>();

  for (const campaign of campaigns) {
    const effect = campaign.effects.item_discount;
    if (!effect) continue;
    const ids = [
      ...(effect.include?.items ?? []),
      ...(effect.include?.categories ?? []).flatMap((categoryId) => categoryItems.get(categoryId) ?? []),
    ];
    for (const id of ids) {
      const item = itemsById.get(id);
      if (!item || item.disabled_info || item.is_wolt_plus_only || item.price < MIN_ITEM_PRICE) continue;
      const discounted = discountedPrice(item.price, effect);
      if (discounted === undefined || discounted >= item.price) continue;
      const current = best.get(id);
      if (!current || discounted < current.price) best.set(id, { campaign, price: discounted, original: item.price, name: item.name });
    }
  }

  return [...best.entries()]
    .sort(([, a], [, b]) => b.original - b.price - (a.original - a.price) || a.price - b.price)
    .slice(0, ITEMS_PER_VENUE)
    .map(([itemId, { campaign, price, original, name }]) => ({
      sourceOfferId: `${itemId}@${campaign.id}@${venue.id}`,
      kind: "discount",
      title: collapseWhitespace(name),
      description: collapseWhitespace(campaign.description.title),
      priceRon: fromMinorUnits(price),
      originalPriceRon: fromMinorUnits(original),
      endsAt: endDate(campaign),
      ...weeklySchedule(campaign.conditions.weekly_time_restrictions),
      conditions: campaignConditions(campaign, { forItem: true }),
      url: venueUrl(venue),
      deliveryOnly: true,
      venue: toVenue(venue),
    }));
}

export function isLunchWithListedItems(campaign: WoltCampaign): boolean {
  return (
    campaignKind(campaign) === "daily_menu" &&
    !campaign.effects.item_discount &&
    listedItemIds(campaign, new Map()).length > 0
  );
}

export function lunchItemOffers(venue: WoltListVenue, campaign: WoltCampaign, assortment: WoltAssortment): ScrapedOffer[] {
  const categoryItems = new Map(assortment.categories.map((category) => [category.id, category.item_ids]));
  const listed = new Set(listedItemIds(campaign, categoryItems));
  const cap = PRICE_CAP.exec(campaign.description.title);
  const maxPrice = cap ? Number(cap[1]) * 100 : Infinity;
  return assortment.items
    .filter((item) => listed.has(item.id) && !item.disabled_info && !item.is_wolt_plus_only)
    .filter((item) => item.price >= MIN_ITEM_PRICE && item.price <= maxPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, LUNCH_ITEMS_PER_VENUE)
    .map((item) => ({
      sourceOfferId: `${item.id}@${campaign.id}@${venue.id}`,
      kind: "daily_menu",
      title: collapseWhitespace(item.name),
      description: collapseWhitespace(campaign.description.title),
      priceRon: fromMinorUnits(item.price),
      endsAt: endDate(campaign),
      ...weeklySchedule(campaign.conditions.weekly_time_restrictions),
      conditions: campaignConditions(campaign, { forItem: true }),
      url: venueUrl(venue),
      deliveryOnly: true,
      venue: toVenue(venue),
    }));
}

function listedItemIds(campaign: WoltCampaign, categoryItems: Map<string, string[]>): string[] {
  return (campaign.conditions.basket_contains ?? []).flatMap((entry) => [
    ...(entry.any_of_items ?? []),
    ...(entry.items_from_categories ?? []).flatMap((categoryId) => categoryItems.get(categoryId) ?? [categoryId]),
  ]);
}

export function discountedPrice(
  price: number,
  effect: NonNullable<WoltCampaign["effects"]["item_discount"]>,
): number | undefined {
  if (effect.fraction) return Math.round(price * (1 - effect.fraction));
  if (effect.amount_per_item) return Math.max(0, price - effect.amount_per_item);
  return undefined;
}

export function weeklySchedule(
  windows: { start: number; end: number }[] | null,
): { daysOfWeek?: number[]; timeStart?: string; timeEnd?: string } {
  if (!windows?.length) return {};
  const minutesPerDay = 1440;
  const slots = windows.map(({ start, end }) => {
    const day = Math.floor(start / minutesPerDay);
    return { day: day + 1, from: start - day * minutesPerDay, to: end - day * minutesPerDay };
  });
  const [first] = slots;
  if (!first || first.to > minutesPerDay || first.to <= first.from) return {};
  if (!slots.every((slot) => slot.from === first.from && slot.to === first.to && slot.day >= 1 && slot.day <= 7)) return {};
  const days = [...new Set(slots.map((slot) => slot.day))].sort((a, b) => a - b);
  if (days.length === 7 && first.from === 0 && first.to === minutesPerDay) return {};
  return { daysOfWeek: days, timeStart: clock(first.from), timeEnd: clock(Math.min(first.to, minutesPerDay - 1)) };
}

export function campaignConditions(campaign: WoltCampaign, { forItem = false } = {}): string | undefined {
  const parts: string[] = [];
  const title = campaign.description.title;
  const minimum = campaign.conditions.basket_contains?.find(
    (entry) => !entry.any_of_items && !entry.items_from_categories && (entry.min_amount ?? 0) >= 1000,
  )?.min_amount;
  if (minimum) parts.push(`comandă minimă ${fromMinorUnits(minimum)} lei`);
  const selectedItemsOnly = campaign.conditions.basket_contains?.some((entry) => entry.any_of_items || entry.items_from_categories);
  if (selectedItemsOnly && !forItem && !ALL_ITEMS.test(title)) {
    parts.push("doar la produsele selectate");
  }
  if (campaign.conditions.max_distance) parts.push(`doar în raza de ${campaign.conditions.max_distance / 1000} km`);
  const methods = campaign.conditions.delivery_methods;
  if (methods?.length === 1 && methods[0] === "homedelivery") parts.push("doar cu livrare");
  if (campaign.conditions.weekly_time_restrictions?.length && !weeklySchedule(campaign.conditions.weekly_time_restrictions).daysOfWeek) {
    parts.push("doar în anumite intervale orare");
  }
  if (WOLT_PLUS_UPSELL.test(title)) parts.push("reducerea mai mare e doar cu Wolt+");
  return parts.length ? parts.join("; ").slice(0, 300) : undefined;
}

function campaignKind(campaign: WoltCampaign): OfferKind {
  if (campaign.effects.free_items || /1\s*\+\s*1/.test(campaign.description.title)) return "combo";
  if (/prânz|pranz|lunch/i.test(campaign.description.title)) return "daily_menu";
  return "discount";
}

function endDate(campaign: WoltCampaign): string | undefined {
  if (!campaign.end_date) return undefined;
  const date = new Date(campaign.end_date);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() >= OPEN_ENDED_YEAR) return undefined;
  return date.toISOString();
}

function toVenue(venue: WoltListVenue): ScrapedVenue {
  const [lon, lat] = venue.location;
  const address = venue.address && !/virtual venue/i.test(venue.address) ? collapseWhitespace(venue.address) : undefined;
  return {
    sourceVenueId: venue.id,
    name: collapseWhitespace(venue.name),
    address: address || undefined,
    lat,
    lon,
    url: venueUrl(venue),
    chain: chainOf(venue.name),
  };
}

function chainOf(name: string): string | undefined {
  const normalized = name.toLowerCase();
  return CHAINS.find((chain) => normalized.startsWith(chain.toLowerCase()));
}

function venueUrl(venue: WoltListVenue): string {
  return `${SITE}/${venue.slug}`;
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

async function fetchOptional<T>(log: Logger, load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await patiently(log, load);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return undefined;
    throw error;
  }
}

async function patiently<T>(log: Logger, load: () => Promise<T>): Promise<T> {
  for (const cooldown of RATE_LIMIT_COOLDOWNS_MS) {
    try {
      return await load();
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 429)) throw error;
      log.warn("wolt rate limited, cooling down", { url: error.url, cooldown });
      await sleep(cooldown);
    }
  }
  return load();
}
