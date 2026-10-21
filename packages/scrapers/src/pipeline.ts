import { isInBucharest, scrapedOfferSchema, type ScrapedVenue, type ValidScrapedOffer } from "@fentezfoamea/core";
import { deactivateUnseen, finishRun, startRun, upsertOffer, upsertVenue, type Sql } from "./db.ts";
import type { Source, SourceContext } from "./source.ts";

export type RunSummary = { source: string; seen: number; rejected: number; deactivated: number; status: "ok" | "failed"; error?: string };

export type OfferSink = {
  write: (offer: ValidScrapedOffer) => Promise<void>;
};

export async function runSource(source: Source, ctx: SourceContext, sql: Sql | null, sink?: OfferSink): Promise<RunSummary> {
  const run = sql ? await startRun(sql, source.id) : null;
  const seenIds = new Set<string>();
  const venueIds = new Map<string, string>();
  let rejected = 0;

  try {
    for await (const candidate of source.scrape(ctx)) {
      const parsed = scrapedOfferSchema.safeParse(candidate);
      if (!parsed.success) {
        rejected++;
        ctx.log.warn("rejected offer", { id: candidate.sourceOfferId, issues: parsed.error.issues.slice(0, 3) });
        continue;
      }
      const offer = parsed.data;
      if (seenIds.has(offer.sourceOfferId)) continue;

      if (offer.venue) {
        offer.venue = await locateVenue(offer.venue, ctx);
        if (offer.venue.lat !== undefined && offer.venue.lon !== undefined && !isInBucharest({ lat: offer.venue.lat, lon: offer.venue.lon })) {
          rejected++;
          continue;
        }
      }

      seenIds.add(offer.sourceOfferId);
      if (sink) await sink.write(offer);
      if (sql) {
        const venueId = offer.venue ? await cachedVenueId(sql, source, offer.venue, venueIds) : null;
        await upsertOffer(sql, source.id, offer, venueId);
      }
      if (ctx.limit && seenIds.size >= ctx.limit) break;
    }

    const deactivated = sql && run && !ctx.limit ? await deactivateUnseen(sql, source.id, run.startedAt) : 0;
    if (sql && run) await finishRun(sql, run.id, { status: "ok", seen: seenIds.size, rejected });
    return { source: source.id, seen: seenIds.size, rejected, deactivated, status: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (sql && run) await finishRun(sql, run.id, { status: "failed", seen: seenIds.size, rejected, error: message });
    return { source: source.id, seen: seenIds.size, rejected, deactivated: 0, status: "failed", error: message };
  }
}

async function locateVenue(venue: ScrapedVenue, ctx: SourceContext): Promise<ScrapedVenue> {
  if (venue.lat !== undefined && venue.lon !== undefined) return venue;
  if (!venue.address) return venue;
  try {
    const point = await ctx.geocoder.locate(venue.address);
    return point ? { ...venue, ...point } : venue;
  } catch (error) {
    ctx.log.warn("geocoding failed", { address: venue.address, error: String(error) });
    return venue;
  }
}

async function cachedVenueId(sql: Sql, source: Source, venue: ScrapedVenue, cache: Map<string, string>): Promise<string> {
  const known = cache.get(venue.sourceVenueId);
  if (known) return known;
  const id = await upsertVenue(sql, source.id, venue);
  cache.set(venue.sourceVenueId, id);
  return id;
}
