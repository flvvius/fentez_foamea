import { createFileRoute } from "@tanstack/react-router";
import { Explorer } from "@/components/Explorer";
import { fetchOfferSnapshot } from "@/server/offers";

export const Route = createFileRoute("/")({
  loader: () => fetchOfferSnapshot(),
  headers: () => ({
    "cache-control": "public, max-age=0, must-revalidate",
    "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
  }),
  component: Home,
});

function Home() {
  const snapshot = Route.useLoaderData();
  return <Explorer snapshot={snapshot} />;
}
