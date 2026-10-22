import { createFileRoute } from "@tanstack/react-router";
import { bagsFeed } from "@/server/bags-feed";
import { sharedSnapshot } from "@/server/shared-snapshot";

export const Route = createFileRoute("/feed.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(bagsFeed((await sharedSnapshot()).offers, new Date()), {
          headers: {
            "content-type": "application/rss+xml; charset=utf-8",
            "cache-control": "public, max-age=300",
            "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
          },
        }),
    },
  },
});
