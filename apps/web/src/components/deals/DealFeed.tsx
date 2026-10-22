import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { takePosted } from "@/lib/deals/posted-flag";
import { fetchDealById } from "@/server/deals/deal-by-id";
import { fetchDealFeed } from "@/server/deals/feed";
import type { DealCard, FeedPage } from "@/server/deals/types";
import type { FeedSort } from "@/server/deals/feed-select";
import { DealRow } from "./DealRow";
import { useDealVotes } from "./useDealVotes";

type Props = {
  sort: FeedSort;
  initial: FeedPage;
  /** A deal the user just published: pinned on top because the cached feed may not have it yet. */
  postedId?: string;
};

export function DealFeed({ sort, initial, postedId }: Readonly<Props>) {
  const navigate = useNavigate();
  const [deals, setDeals] = useState(initial.deals);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pinned, setPinned] = useState<DealCard | null>(null);

  // The post form leaves a one-shot marker in sessionStorage. Only when it matches the id in
  // the address is the new deal fetched by id and pinned (the cached feed may not list it yet);
  // anyone else opening /?posted=<id> sees an ordinary feed. The id is dropped from the
  // address either way, so reloading or sharing the page doesn't repeat the note.
  useEffect(() => {
    if (!postedId) return;
    if (takePosted(postedId)) {
      fetchDealById({ data: { id: postedId } })
        .then((deal) => {
          if (deal) setPinned(deal);
        })
        .catch(() => undefined);
    }
    void navigate({ to: "/", search: { sort }, replace: true });
  }, [postedId, sort, navigate]);

  const listed = useMemo(
    () => (pinned ? [pinned, ...deals.filter((deal) => deal.id !== pinned.id)] : deals),
    [pinned, deals],
  );
  const { viewOf, vote } = useDealVotes(listed);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setLoadError(false);
    try {
      const page = await fetchDealFeed({ data: { sort, cursor } });
      setDeals((current) => {
        const seen = new Set(current.map((deal) => deal.id));
        return [...current, ...page.deals.filter((deal) => !seen.has(deal.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  if (listed.length === 0) {
    return (
      <div className="empty">
        <p>Încă nu e nicio ofertă aici. Fii primul care postează una: un link sau o captură de ecran e de ajuns.</p>
      </div>
    );
  }

  return (
    <div className="deal-list">
      {listed.map((deal) => (
        <DealRow
          key={deal.id}
          deal={deal}
          vote={viewOf(deal)}
          onVote={(click) => void vote(deal, click)}
          note={deal.id === pinned?.id ? "Oferta ta a fost publicată" : undefined}
        />
      ))}
      {cursor && (
        <div className="more-wrap">
          <button type="button" className="more" onClick={() => void loadMore()} disabled={loading}>
            {loading ? "Se încarcă…" : "Mai multe"}
          </button>
          {loadError && (
            <p role="alert" className="vote-error">
              <span className="err-label">Eroare: </span>
              Nu am putut încărca mai multe oferte. Încearcă din nou.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
