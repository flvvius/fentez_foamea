import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { countOffers } from "@/lib/format";
import type { SavedPicks as SavedPicksData } from "@/lib/highlights";
import { useSavedVenues } from "@/lib/saved-venues";
import { fetchSavedPicks } from "@/server/highlights";
import { HighlightRow } from "./HomeHighlights";

export function SavedPicks() {
  const { ids } = useSavedVenues();
  const [saved, setSaved] = useState<SavedPicksData | null>(null);

  useEffect(() => {
    if (ids.length === 0) return setSaved(null);
    let current = true;
    fetchSavedPicks({ data: { ids: [...ids] } })
      .then((result) => current && setSaved(result))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [ids]);

  if (ids.length === 0 || !saved) return null;
  return (
    <section className="highlights" aria-labelledby="saved-title">
      <div className="highlights-head">
        <h2 id="saved-title" className="section-title">
          La localurile tale
        </h2>
        <Link to="/harta" search={{ salvate: "da" }} className="link-quiet">
          {saved.total > saved.picks.length ? `Toate cele ${countOffers(saved.total)}` : "Pe hartă"}
        </Link>
      </div>
      {saved.picks.length === 0 ? (
        <p className="muted saved-empty">Localurile salvate nu au oferte azi.</p>
      ) : (
        <ul className="highlight-list">
          {saved.picks.map((pick) => (
            <li key={pick.id}>
              <HighlightRow pick={pick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
