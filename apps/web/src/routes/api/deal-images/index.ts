import { createFileRoute } from "@tanstack/react-router";
import { uploadImageRoute } from "@/server/submit/image-routes";

export const Route = createFileRoute("/api/deal-images/")({
  server: {
    handlers: {
      POST: ({ request }) => uploadImageRoute(request),
    },
  },
});
