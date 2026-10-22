import { createFileRoute } from "@tanstack/react-router";
import { Explorer } from "@/components/Explorer";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchOfferSnapshot } from "@/server/offers";

export const Route = createFileRoute("/harta")({
  loader: () => fetchOfferSnapshot(),
  headers: () => ({
    "cache-control": "public, max-age=0, must-revalidate",
    "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
  }),
  head: () => ({
    meta: [
      { title: "Harta ofertelor · fentez foamea" },
      {
        name: "description",
        content:
          "Pachete anti-risipă, meniuri de prânz și reduceri de la restaurante și fast-food-uri din București, pe o singură hartă.",
      },
    ],
  }),
  component: Harta,
});

function Harta() {
  const snapshot = Route.useLoaderData();
  return (
    <div className="harta-page">
      <SiteHeader />
      <Explorer snapshot={snapshot} />
    </div>
  );
}
