import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { Explorer } from "@/components/Explorer";
import { decodeSnapshot, type SnapshotWire } from "@/lib/offers";
import { searchFromState, stateFromSearch, validateSearch, type ExploreState } from "@/lib/search";
import { offerHeadline, offerLink, offerSummary } from "@/lib/share";
import { SITE_URL } from "@/lib/site";
import { fetchOfferSnapshot } from "@/server/offers";

export const Route = createFileRoute("/")({
  validateSearch,
  loader: () => fetchOfferSnapshot(),
  headers: () => ({
    "cache-control": "public, max-age=0, must-revalidate",
    "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
  }),
  head: ({ loaderData, match }) => ({ meta: sharedOfferMeta(loaderData, match.search.oferta) }),
  component: Home,
});

function Home() {
  const wire = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const snapshot = useMemo(() => decodeSnapshot(wire), [wire]);
  const state = useMemo(() => stateFromSearch(search), [search]);

  const onChange = useCallback(
    (next: Partial<ExploreState>) =>
      navigate({ search: (prev) => searchFromState({ ...stateFromSearch(prev), ...next }), replace: true, resetScroll: false }),
    [navigate],
  );

  return <Explorer snapshot={snapshot} state={state} onChange={onChange} />;
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
  ];
}
