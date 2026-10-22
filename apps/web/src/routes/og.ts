import { createFileRoute } from "@tanstack/react-router";
import { findLanding } from "@/lib/landing";
import { findZone } from "@/lib/zones";
import { findOfferForImage, findTodaySummary, renderOfferImage, renderTodayImage } from "@/server/offer-image";

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const zoneSlug = params.get("zona");
        if (zoneSlug !== null) {
          const zone = findZone(zoneSlug);
          if (!zone) return Response.redirect(new URL("/og", request.url), 302);
          return renderTodayImage(await findTodaySummary({ zone }), new Date(), { zone });
        }
        const landingSlug = params.get("categorie");
        if (landingSlug !== null) {
          const landing = findLanding(landingSlug);
          if (!landing) return Response.redirect(new URL("/og", request.url), 302);
          return renderTodayImage(await findTodaySummary({ landing }), new Date(), { landing });
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
