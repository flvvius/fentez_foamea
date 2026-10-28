import { createFileRoute } from "@tanstack/react-router";
import { findLanding } from "@/lib/landing";
import { findZone } from "@/lib/zones";
import { loadDealById } from "@/server/deals/deal-by-id";
import { UUID_RE } from "@/server/deals/uuid";
import { dealCardRow, findOfferForImage, findTodaySummary, findVenue, renderOfferImage, renderTodayImage } from "@/server/offer-image";

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const dealId = params.get("deal");
        if (dealId !== null) {
          const deal = UUID_RE.test(dealId) ? await loadDealById(dealId.toLowerCase()) : null;
          if (!deal) return Response.redirect(new URL("/og.png", request.url), 302);
          return renderOfferImage(dealCardRow(deal));
        }
        const venueId = params.get("local");
        if (venueId !== null) {
          const venue = await findVenue(venueId);
          if (!venue) return Response.redirect(new URL("/og", request.url), 302);
          return renderTodayImage(await findTodaySummary({ venue }), new Date(), { venue });
        }
        const query = params.get("q")?.trim().slice(0, 60);
        if (query) return renderTodayImage(await findTodaySummary({ query }), new Date(), { query });
        const zoneSlug = params.get("zona");
        const landingSlug = params.get("categorie");
        if (zoneSlug !== null || landingSlug !== null) {
          const zone = zoneSlug === null ? undefined : findZone(zoneSlug);
          const landing = landingSlug === null ? undefined : findLanding(landingSlug);
          if ((zoneSlug !== null && !zone) || (landingSlug !== null && !landing)) {
            return Response.redirect(new URL("/og", request.url), 302);
          }
          return renderTodayImage(await findTodaySummary({ zone, landing }), new Date(), { zone, landing });
        }
        const id = params.get("oferta");
        if (id === null) return renderTodayImage(await findTodaySummary(), new Date());
        const offer = await findOfferForImage(id);
        if (!offer) return Response.redirect(new URL("/og.png", request.url), 302);
        return renderOfferImage(offer);
      },
    },
  },
});
