import { createFileRoute } from "@tanstack/react-router";
import { loadOfferSnapshot } from "@/server/snapshot";

export const Route = createFileRoute("/api/snapshot")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(await loadOfferSnapshot(), {
          headers: {
            "cache-control": "public, max-age=0, must-revalidate",
            "cdn-cache-control": "public, s-maxage=120, stale-while-revalidate=3600, stale-if-error=86400",
          },
        }),
    },
  },
});
