import { createFileRoute } from "@tanstack/react-router";
import { findLanding } from "@/lib/landing";
import { findZone } from "@/lib/zones";
import { findOfferForImage, findTodaySummary, findVenue, renderOfferImage, renderTodayImage } from "@/server/offer-image";

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const venueId = params.get("local");
        if (venueId !== null) {
          const venue = await findVenue(venueId);
          if (!venue) return Response.redirect(new URL("/og", request.url), 302);
          return renderTodayImage(await findTodaySummary({ venue }), new Date(), { venue });
        }
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
