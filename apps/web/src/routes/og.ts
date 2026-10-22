import { createFileRoute } from "@tanstack/react-router";
import { findOfferForImage, renderOfferImage } from "@/server/offer-image";

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("oferta") ?? "";
        const offer = await findOfferForImage(id);
        if (!offer) return Response.redirect(new URL("/og.png", request.url), 302);
        return renderOfferImage(offer);
      },
    },
  },
});
