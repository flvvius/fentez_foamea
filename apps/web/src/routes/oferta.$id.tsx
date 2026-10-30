import { useMemo } from "react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { DealRow } from "@/components/deals/DealRow";
import { useDealVotes } from "@/components/deals/useDealVotes";
import { SiteHeader } from "@/components/SiteHeader";
import { dealMeta } from "@/lib/deals/deal-meta";
import { fetchDealById } from "@/server/deals/deal-by-id";
import type { DealCard } from "@/server/deals/types";
import { UUID_RE } from "@/server/deals/uuid";

export const Route = createFileRoute("/oferta/$id")({
  loader: async ({ params }) => {
    const deal = UUID_RE.test(params.id) ? await fetchDealById({ data: { id: params.id } }) : null;
    if (!deal) throw notFound();
    return deal;
  },
  // Header precedence: during SSR the loader's server fn (fetchDealById) sets its own
  // cache-control ("public, max-age=30", s-maxage=60, stale-while-revalidate=300), and that
  // replaces these route headers on the page response. These match it and only matter if the
  // server fn sets nothing.
  headers: () => ({
    "cache-control": "public, max-age=0, must-revalidate",
    "cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=300",
  }),
  head: ({ loaderData }) => (loaderData ? dealMeta(loaderData) : { meta: [{ title: "Oferta nu există · fentez foamea" }] }),
  component: DealPage,
  notFoundComponent: DealNotFound,
});

function BackLink() {
  return (
    <p className="back">
      <Link to="/" className="link-quiet">
        ← Toate ofertele
      </Link>
    </p>
  );
}

function DealPage() {
  const deal = Route.useLoaderData();
  return (
    <>
      <SiteHeader />
      <main className="page">
        <BackLink />
        <Single deal={deal} />
      </main>
    </>
  );
}

function Single({ deal }: Readonly<{ deal: DealCard }>) {
  const deals = useMemo(() => [deal], [deal]);
  const { viewOf, vote } = useDealVotes(deals);
  return <DealRow deal={deal} vote={viewOf(deal)} onVote={(click) => void vote(deal, click)} linkTitle={false} />;
}

function DealNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="page">
        <BackLink />
        <h1 className="headline">Oferta nu mai e aici</h1>
        <p className="lede">Poate a expirat, a fost retrasă sau linkul nu e corect.</p>
      </main>
    </>
  );
}
