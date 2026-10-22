import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { ExplorePage, useExploreState } from "@/components/ExplorePage";
import type { SnapshotWire } from "@/lib/offers";
import { searchFromState, stateFromSearch, validateSearch, type ExploreState } from "@/lib/search";
import { offerHeadline, offerLink, offerSummary } from "@/lib/share";
import { SITE_URL } from "@/lib/site";
import { fetchOfferSnapshot } from "@/server/offers";

export const SNAPSHOT_HEADERS = {
  "cache-control": "public, max-age=0, must-revalidate",
  "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
};

export const Route = createFileRoute("/")({
  validateSearch,
  loader: () => fetchOfferSnapshot(),
  headers: () => SNAPSHOT_HEADERS,
  head: ({ loaderData, match }) => ({
    meta: sharedOfferMeta(loaderData, match.search.oferta),
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Home,
});

function Home() {
  const wire = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const state = useExploreState(search);

  const onChange = useCallback(
    (next: Partial<ExploreState>) =>
      navigate({ search: (prev) => searchFromState({ ...stateFromSearch(prev), ...next }), replace: true, resetScroll: false }),
    [navigate],
  );

  return <ExplorePage wire={wire} state={state} onChange={onChange} />;
}

function sharedOfferMeta(wire: SnapshotWire | undefined, offerId: string | undefined) {
  if (!wire || !offerId) return [];
  const index = wire.offers.id.indexOf(offerId);
  if (index < 0) return [];
  const venue = wire.offers.venue[index];
  const offer = {
    title: wire.offers.title[index]!,
    price: wire.offers.price[index] ?? null,
    discountPct: wire.offers.discountPct[index] ?? null,
    kind: wire.offers.kind[index]!,
    deliveryOnly: wire.offers.deliveryOnly[index]!,
    venueName: venue == null ? null : (wire.venues.name[venue] ?? null),
    chain: venue == null ? null : (wire.venues.chain[venue] ?? null),
  };
  const title = offerHeadline(offer);
  const description = offerSummary(offer);
  return [
    { title: `${title} · fentez foamea` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: offerLink(SITE_URL, offerId) },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { property: "og:image", content: `${SITE_URL}/og?oferta=${encodeURIComponent(offerId)}` },
    { name: "twitter:image", content: `${SITE_URL}/og?oferta=${encodeURIComponent(offerId)}` },
  ];
}
