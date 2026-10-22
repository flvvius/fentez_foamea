import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { ExplorePage, useExploreState } from "@/components/ExplorePage";
import type { SnapshotWire } from "@/lib/offers";
import { searchFromState, stateFromSearch, validateSearch, type ExploreState } from "@/lib/search";
import { offerHeadline, offerLink, offerSummary } from "@/lib/share";
import { countOffers } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { fetchOfferSnapshot } from "@/server/offers";

export const SNAPSHOT_HEADERS = {
  "cache-control": "public, max-age=0, must-revalidate",
  "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "fentez foamea",
  url: SITE_URL,
  inLanguage: "ro",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}&km=oras` },
    "query-input": "required name=search_term_string",
  },
};

export const Route = createFileRoute("/")({
  validateSearch,
  loader: () => fetchOfferSnapshot(),
  headers: () => SNAPSHOT_HEADERS,
  head: ({ loaderData, match }) => ({
    meta: match.search.oferta
      ? sharedOfferMeta(loaderData, match.search.oferta)
      : match.search.local
        ? venueMeta(loaderData, match.search.local)
        : searchMeta(match.search.q),
    links: [{ rel: "canonical", href: canonicalFor(loaderData, match.search.local) }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(WEBSITE_JSON_LD) }],
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

  const query = state.query.trim();
  const venue = state.venueId ? venueName(wire, state.venueId) : undefined;
  const headline = venue ? `Oferte la ${venue}, acum.` : query ? `${searchTitle(query)}, acum.` : undefined;
  return <ExplorePage wire={wire} state={state} headline={headline} onChange={onChange} />;
}

function venueName(wire: SnapshotWire | undefined, venueId: string): string | undefined {
  const index = wire?.venues.id.indexOf(venueId) ?? -1;
  return index < 0 ? undefined : wire!.venues.name[index];
}

function canonicalFor(wire: SnapshotWire | undefined, venueId: string | undefined): string {
  return venueId && venueName(wire, venueId) ? `${SITE_URL}/?local=${encodeURIComponent(venueId)}` : SITE_URL;
}

function searchTitle(query: string): string {
  return `Oferte cu „${query}” în București`;
}

function venueMeta(wire: SnapshotWire | undefined, venueId: string) {
  const name = venueName(wire, venueId);
  if (!wire || !name) return [];
  const index = wire.venues.id.indexOf(venueId);
  const count = wire.offers.venue.filter((venue) => venue === index).length;
  const title = `Oferte la ${name}`;
  const description = `${countOffers(count)} la ${name} acum: prețuri, reduceri și program, pe fentez foamea.`;
  return [
    { title: `${title} · fentez foamea` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { property: "og:image", content: `${SITE_URL}/og?local=${venueId}` },
    { name: "twitter:image", content: `${SITE_URL}/og?local=${venueId}` },
  ];
}

function searchMeta(rawQuery: string | undefined) {
  const query = rawQuery?.trim().slice(0, 60);
  if (!query) return [];
  const title = searchTitle(query);
  const description = `Pachete anti-risipă, meniuri și reduceri cu „${query}” la restaurante din București, pe o hartă, ordonate după distanță.`;
  return [
    { title: `${title} · fentez foamea` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { property: "og:image", content: `${SITE_URL}/og?q=${encodeURIComponent(query)}` },
    { name: "twitter:image", content: `${SITE_URL}/og?q=${encodeURIComponent(query)}` },
  ];
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
