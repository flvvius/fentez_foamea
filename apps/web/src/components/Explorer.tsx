"use client";

import { Link } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUCHAREST_CENTER, OFFER_KINDS, OFFER_KIND_LABELS, type LatLon, type OfferKind } from "@fentezfoamea/core";
import { countOffers, formatRelative } from "@/lib/format";
import { LANDINGS } from "@/lib/landing";
import { ZONES } from "@/lib/zones";
import type { OfferSnapshot } from "@/lib/offers";
import { BUDGET_OPTIONS, RADIUS_OPTIONS, type ExploreState, type SortKey } from "@/lib/search";
import { shareCurrentView } from "@/lib/share";
import { OfferCard } from "./OfferCard";
import { ShareButton } from "./ShareButton";
import { applyFilters, collapseChainCopies, placeOffers, sortOffers, validTodayFirst, venuePins } from "./explore";

const OfferMap = lazy(() => import("./OfferMap"));

const SORTS: { key: SortKey; label: string }[] = [
  { key: "best", label: "recomandate" },
  { key: "distance", label: "cele mai aproape" },
  { key: "discount", label: "reducere mare" },
  { key: "price", label: "cele mai ieftine" },
];

const PAGE = 60;

type Origin = LatLon & { mine: boolean };
type LocateState = "idle" | "locating" | "denied";

type Props = {
  snapshot: OfferSnapshot;
  state: ExploreState;
  headline?: string;
  center?: LatLon & { name: string; slug?: string };
  onChange: (next: Partial<ExploreState>) => void;
};

const FEW_OFFERS = 3;
const QUERY_DEBOUNCE_MS = 200;

export function Explorer({ snapshot, state, headline = "Mâncare ieftină în București, acum.", center, onChange }: Readonly<Props>) {
  const { kinds, radiusKm, maxPrice, includeDelivery, sort, venueId, offerId, query } = state;
  const [draftQuery, setDraftQuery] = useState(query);
  const sentQuery = useRef(query);
  useEffect(() => {
    if (query !== sentQuery.current) setDraftQuery(query);
    sentQuery.current = query;
  }, [query]);
  const [now, setNow] = useState(() => new Date(snapshot.generatedAt));
  const [mounted, setMounted] = useState(false);
  const [origin, setOrigin] = useState<Origin>({ lat: (center ?? BUCHAREST_CENTER).lat, lon: (center ?? BUCHAREST_CENTER).lon, mine: false });
  const [locate, setLocate] = useState<LocateState>("idle");
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const placed = useMemo(() => placeOffers(snapshot.offers, origin, now), [snapshot.offers, origin, now]);
  const filtered = useMemo(
    () => applyFilters(placed, { kinds, radiusKm: venueId ? null : radiusKm, maxPrice, includeDelivery, query }),
    [placed, kinds, radiusKm, maxPrice, includeDelivery, venueId, query],
  );
  const pins = useMemo(() => venuePins(filtered), [filtered]);
  const shared = offerId ? placed.find((offer) => offer.id === offerId) : undefined;
  const scopedPlace = venueId ? (placed.find((offer) => offer.venueId === venueId)?.placeId ?? venueId) : null;
  const listed = useMemo(() => {
    const scoped = filtered.filter((offer) => (!scopedPlace || offer.placeId === scopedPlace) && offer.id !== offerId);
    return validTodayFirst(collapseChainCopies(sortOffers(scoped, sort)), now);
  }, [filtered, scopedPlace, offerId, sort, now]);
  const wider = useMemo(() => {
    if (venueId || radiusKm === null || listed.length >= FEW_OFFERS) return null;
    const larger = RADIUS_OPTIONS.slice(RADIUS_OPTIONS.indexOf(radiusKm as (typeof RADIUS_OPTIONS)[number]) + 1);
    for (const km of larger) {
      const extra = applyFilters(placed, { kinds, radiusKm: km, maxPrice, includeDelivery, query }).length - filtered.length;
      if (extra > 0) return { km, extra };
    }
    return null;
  }, [venueId, radiusKm, listed.length, placed, kinds, maxPrice, includeDelivery, query, filtered.length]);
  const nearbyCount = useMemo(
    () => (center && radiusKm !== null ? applyFilters(placed, { kinds: [], radiusKm, maxPrice: null, includeDelivery: true }).length : null),
    [center, placed, radiusKm],
  );
  const kindCounts = useMemo(() => {
    const anyKind = applyFilters(placed, { kinds: [], radiusKm: venueId ? null : radiusKm, maxPrice, includeDelivery, query });
    return countKinds(collapseChainCopies(sortOffers(anyKind, "distance")));
  }, [placed, venueId, radiusKm, maxPrice, includeDelivery, query]);
  const venueName = venueId ? placed.find((offer) => offer.venueId === venueId)?.venueName : undefined;

  const change = (next: Partial<ExploreState>) => {
    setVisible(PAGE);
    onChange(next);
  };

  const findVisitor = useCallback(
    (preferDistanceOrder: boolean) => {
      if (!("geolocation" in navigator)) return setLocate("denied");
      setLocate("locating");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setOrigin({ lat: position.coords.latitude, lon: position.coords.longitude, mine: true });
          if (preferDistanceOrder) onChange({ sort: "distance" });
          setLocate("idle");
        },
        () => setLocate("denied"),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
      );
    },
    [onChange],
  );
  const locateMe = useCallback(() => findVisitor(true), [findVisitor]);

  const triedSilentLocate = useRef(false);
  useEffect(() => {
    if (triedSilentLocate.current || center || !navigator.permissions) return;
    triedSilentLocate.current = true;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => status.state === "granted" && findVisitor(false))
      .catch(() => undefined);
  }, [center, findVisitor]);

  const queryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(queryTimer.current), []);
  const typeQuery = (value: string) => {
    setDraftQuery(value);
    clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => {
      sentQuery.current = value;
      change({ query: value });
    }, QUERY_DEBOUNCE_MS);
  };

  const toggleKind = (kind: OfferKind) =>
    change({ kinds: kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind] });

  const showVenue = (id: string | null) => {
    change({ venueId: id, offerId: null });
    if (id) document.getElementById("oferte")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="shell">
      <section className="panel" aria-label="Oferte">
        <header className="masthead">
          <p className="brand">fentez foamea</p>
          <h1 className="headline">{headline}</h1>
          <p className="lede">
            {nearbyCount === null
              ? `${countOffers(placed.length)} de la restaurante, fast-food-uri și cofetării`
              : `${countOffers(nearbyCount)} la cel mult ${radiusKm} km de ${center!.name}`}
            : pachete salvate de la aruncat, meniuri de prânz, reduceri.
            {snapshot.updatedAt && <> Actualizat {formatRelative(snapshot.updatedAt, now)}.</>}
          </p>
          <div className="masthead-actions">
            <button type="button" className="locate" onClick={locateMe} disabled={locate === "locating"}>
              {locateLabel(locate, origin.mine)}
            </button>
            <ShareButton
              className="share-view"
              label="Trimite lista"
              share={() => shareCurrentView(`${headline} ${countOffers(listed.length)} pe fentez foamea.`)}
            />
          </div>
          {locate === "denied" && (
            <p className="hint">Nu am primit locația. Permite accesul în browser sau mută harta; distanțele sunt calculate din {center ? `zona ${center.name}` : "centru"}.</p>
          )}
        </header>

        {offerId && (
          <section className="shared" aria-label="Oferta primită">
            {shared ? (
              <>
                <p className="shared-note">Ți-a trimis cineva oferta asta</p>
                <OfferCard offer={shared} now={now} onShowVenue={showVenue} />
              </>
            ) : (
              <p className="shared-note">Oferta primită nu mai e disponibilă. Uite ce mai e acum prin oraș.</p>
            )}
            <button type="button" className="link-quiet" onClick={() => change({ offerId: null })}>
              Închide
            </button>
          </section>
        )}

        <fieldset className="filters">
          <legend className="sr-only">Filtre</legend>
          <input
            type="search"
            className="search"
            aria-label="Caută"
            placeholder="Caută un local sau un produs"
            value={draftQuery}
            onChange={(e) => typeQuery(e.target.value)}
          />
          <div className="chip-row">
            {OFFER_KINDS.filter((kind) => kindCounts[kind] || kinds.includes(kind)).map((kind) => (
              <button
                key={kind}
                type="button"
                className="chip"
                aria-pressed={kinds.includes(kind)}
                data-kind={kind}
                onClick={() => toggleKind(kind)}
              >
                {OFFER_KIND_LABELS[kind]} <span className="chip-count">{kindCounts[kind] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="filter-line">
            <label>
              <span className="filter-label">Distanță</span>
              <select value={radiusKm ?? ""} onChange={(e) => change({ radiusKm: e.target.value ? Number(e.target.value) : null })}>
                {RADIUS_OPTIONS.map((km) => (
                  <option key={km ?? "all"} value={km ?? ""}>
                    {km === null ? "tot orașul" : `până la ${km} km`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filter-label">Buget</span>
              <select value={maxPrice ?? ""} onChange={(e) => change({ maxPrice: e.target.value ? Number(e.target.value) : null })}>
                {BUDGET_OPTIONS.map((lei) => (
                  <option key={lei ?? "any"} value={lei ?? ""}>
                    {lei === null ? "oricât" : `sub ${lei} lei`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filter-label">Ordine</span>
              <select value={sort} onChange={(e) => change({ sort: e.target.value as SortKey })}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={includeDelivery} onChange={(e) => change({ includeDelivery: e.target.checked })} />
              <span>și livrări</span>
            </label>
          </div>
        </fieldset>

        <div id="oferte" className="list">
          {venueId && (
            <div className="venue-scope">
              <span>
                <strong>{venueName ?? "Localul ales"}</strong> · {countOffers(listed.length)}
              </span>
              <button type="button" className="link-quiet" onClick={() => showVenue(null)}>
                Toate ofertele
              </button>
            </div>
          )}
          {listed.length === 0 ? (
            <div className="empty">
              <p>Nicio ofertă cu filtrele astea.</p>
              <button type="button" className="link-quiet" onClick={() => change({ kinds: [], radiusKm: null, maxPrice: null, venueId: null, query: "" })}>
                Arată tot orașul
              </button>
            </div>
          ) : (
            listed.slice(0, visible).map((offer) => <OfferCard key={offer.id} offer={offer} now={now} onShowVenue={showVenue} />)
          )}
          {wider && (
            <button type="button" className="more" onClick={() => change({ radiusKm: wider.km })}>
              Încă {countOffers(wider.extra)} {wider.km === null ? "în tot orașul" : `până la ${wider.km} km`}
            </button>
          )}
          {listed.length > visible && (
            <button type="button" className="more" onClick={() => setVisible((v) => v + PAGE)}>
              Arată încă {Math.min(PAGE, listed.length - visible)} <span className="muted">din {listed.length - visible}</span>
            </button>
          )}
          <footer className="colophon">
            Datele vin din aplicațiile și site-urile partenerilor; prețul și disponibilitatea finală sunt cele de acolo.
            Fiecare ofertă duce la sursa ei.
            <nav aria-label="Categorii" className="categories">
              {center?.slug
                ? LANDINGS.filter((landing) => landing.inZones).map((landing) => (
                    <Link
                      key={landing.slug}
                      to="/zona/$zona/$categorie"
                      params={{ zona: center.slug!, categorie: landing.slug }}
                      className="link-quiet"
                    >
                      {OFFER_KIND_LABELS[landing.kind]} lângă {center.name}
                    </Link>
                  ))
                : LANDINGS.map((landing) => (
                    <Link key={landing.slug} to="/$categorie" params={{ categorie: landing.slug }} className="link-quiet">
                      {OFFER_KIND_LABELS[landing.kind]}
                    </Link>
                  ))}
            </nav>
            <nav aria-label="Zone" className="categories">
              {ZONES.map((zone) => (
                <Link key={zone.slug} to="/zona/$zona" params={{ zona: zone.slug }} className="link-quiet">
                  {zone.name}
                </Link>
              ))}
            </nav>
          </footer>
        </div>
      </section>

      <section className="map" aria-label="Hartă">
        {mounted ? (
          <Suspense fallback={<div className="map-placeholder" aria-hidden />}>
            <OfferMap pins={pins} origin={origin} selectedVenueId={scopedPlace} onSelectVenue={showVenue} />
          </Suspense>
        ) : (
          <div className="map-placeholder" aria-hidden />
        )}
      </section>
    </main>
  );
}

function locateLabel(locate: LocateState, hasOwnLocation: boolean): string {
  if (locate === "locating") return "Te caut pe hartă…";
  return hasOwnLocation ? "Actualizează locația" : "Arată ce e lângă mine";
}

function countKinds(offers: { kind: OfferKind }[]): Partial<Record<OfferKind, number>> {
  const counts: Partial<Record<OfferKind, number>> = {};
  for (const offer of offers) counts[offer.kind] = (counts[offer.kind] ?? 0) + 1;
  return counts;
}
