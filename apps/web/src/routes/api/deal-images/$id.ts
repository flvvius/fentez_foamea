import { createFileRoute } from "@tanstack/react-router";
import { UUID_RE } from "@/server/deals/uuid";
import { getImageRoute } from "@/server/submit/image-routes";

export const Route = createFileRoute("/api/deal-images/$id")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        UUID_RE.test(params.id)
          ? getImageRoute(params.id.toLowerCase(), request)
          : new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } }),
    },
  },
});
