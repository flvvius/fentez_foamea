import { Link } from "@tanstack/react-router";
import { countOffers, formatPickup, formatPrice } from "@/lib/format";
import type { Highlight, Highlights } from "@/lib/highlights";
import { useSavedVenues } from "@/lib/saved-venues";

export function HomeHighlights({ highlights }: Readonly<{ highlights: Highlights }>) {
  const { ids: savedIds } = useSavedVenues();
  if (highlights.picks.length === 0) return null;
  return (
    <section className="highlights" aria-labelledby="highlights-title">
      <div className="highlights-head">
        <h2 id="highlights-title" className="section-title">
          Cele mai bune oferte de azi
        </h2>
        <p className="muted">Din {countOffers(highlights.total)} adunate de la restaurante din București.</p>
      </div>
      <ul className="highlight-list">
        {highlights.picks.map((pick) => (
          <li key={pick.id}>
            <HighlightRow pick={pick} />
          </li>
        ))}
      </ul>
      <nav className="kind-links" aria-label="Pe categorii">
        {savedIds.length > 0 && (
          <Link to="/harta" search={{ salvate: "da" }} className="kind-link">
            ★ Localurile salvate <span className="muted">{savedIds.length}</span>
          </Link>
        )}
        {highlights.kinds.map((entry) => (
          <Link key={entry.slug} to="/$categorie" params={{ categorie: entry.slug }} className="kind-link">
            {entry.label} <span className="muted">{entry.count}</span>
          </Link>
        ))}
        <Link to="/harta" className="kind-link kind-link-map">
          Toate pe hartă <span aria-hidden>→</span>
        </Link>
      </nav>
    </section>
  );
}

export function HighlightRow({ pick }: Readonly<{ pick: Highlight }>) {
  const wasHigher = pick.originalPrice !== null && pick.price !== null && pick.originalPrice > pick.price;
  return (
    <Link to="/harta" search={pick.venueId ? { local: pick.venueId } : { q: pick.title, km: "oras" }} className="highlight">
      <span className="figure">
        <span className="figure-price">
          {formatPrice(pick.price!)}
          <span className="figure-unit">lei</span>
        </span>
        {wasHigher && (
          <s className="figure-was">
            <span className="sr-only">înainte </span>
            {formatPrice(pick.originalPrice!)} lei
          </s>
        )}
      </span>
      <span className="min-w-0">
        <span className="highlight-title">
          {pick.title}
          {pick.isNew && <span className="offer-new"> · nou</span>}
        </span>
        <span className="highlight-meta">
          {pick.venueName ?? pick.chain}
          {pick.discountPct !== null && <span className="figure-off"> · −{pick.discountPct}%</span>}
        </span>
        <When pick={pick} />
      </span>
    </Link>
  );
}

function When({ pick }: Readonly<{ pick: Highlight }>) {
  if (pick.pickupStart && pick.pickupEnd) {
    return (
      <span className="highlight-when" suppressHydrationWarning>
        Ridici {formatPickup(pick.pickupStart, pick.pickupEnd, new Date())}
        {pick.available !== null && pick.available <= 3 && <span className="urgent"> · {pick.available === 1 ? "ultimul" : `mai sunt ${pick.available}`}</span>}
      </span>
    );
  }
  if (pick.timeStart && pick.timeEnd) return <span className="highlight-when">Azi {pick.timeStart}–{pick.timeEnd}</span>;
  return null;
}

