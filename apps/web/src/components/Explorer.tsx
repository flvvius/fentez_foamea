"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BUCHAREST_CENTER, OFFER_KINDS, OFFER_KIND_LABELS, type LatLon, type OfferKind } from "@fentezfoamea/core";
import { formatRelative } from "@/lib/format";
import type { OfferSnapshot } from "@/lib/offers";
import { OfferCard } from "./OfferCard";
import { applyFilters, placeOffers, sortOffers, venuePins, type SortKey } from "./explore";

const OfferMap = dynamic(() => import("./OfferMap"), {
  ssr: false,
  loading: () => <div className="map-placeholder" aria-hidden />,
});

const RADII: { label: string; km: number | null }[] = [
  { label: "1 km", km: 1 },
  { label: "3 km", km: 3 },
  { label: "10 km", km: 10 },
  { label: "tot orașul", km: null },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "distance", label: "cele mai aproape" },
  { key: "discount", label: "reducere mare" },
  { key: "price", label: "cele mai ieftine" },
];

const PAGE = 60;

type Origin = LatLon & { mine: boolean };
type LocateState = "idle" | "locating" | "denied";

export function Explorer({ snapshot, renderedAt }: Readonly<{ snapshot: OfferSnapshot; renderedAt: string }>) {
  const [now, setNow] = useState(() => new Date(renderedAt));
  const [origin, setOrigin] = useState<Origin>({ ...BUCHAREST_CENTER, mine: false });
  const [locate, setLocate] = useState<LocateState>("idle");
  const [kinds, setKinds] = useState<OfferKind[]>([]);
  const [radiusKm, setRadiusKm] = useState<number | null>(3);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const [sort, setSort] = useState<SortKey>("distance");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const placed = useMemo(() => placeOffers(snapshot.offers, origin, now), [snapshot.offers, origin, now]);
  const filtered = useMemo(
    () => applyFilters(placed, { kinds, radiusKm, includeDelivery }),
    [placed, kinds, radiusKm, includeDelivery],
  );
  const pins = useMemo(() => venuePins(filtered), [filtered]);
  const listed = useMemo(() => {
    const scoped = venueId ? filtered.filter((offer) => offer.venueId === venueId) : filtered;
    return sortOffers(scoped, sort);
  }, [filtered, venueId, sort]);
  const kindCounts = useMemo(() => countKinds(placed), [placed]);
  const selectedVenue = venueId ? pins.find((pin) => pin.venueId === venueId) : undefined;

  const locateMe = useCallback(() => {
    if (!("geolocation" in navigator)) return setLocate("denied");
    setLocate("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lon: position.coords.longitude, mine: true });
        setSort("distance");
        setLocate("idle");
      },
      () => setLocate("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  const toggleKind = (kind: OfferKind) => {
    setVisible(PAGE);
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  };

  const showVenue = (id: string | null) => {
    setVenueId(id);
    setVisible(PAGE);
    if (id) document.getElementById("oferte")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="shell">
      <section className="panel" aria-label="Oferte">
        <header className="masthead">
          <p className="brand">fentez foamea</p>
          <h1 className="headline">
            Mâncare ieftină în București, <em>acum</em>.
          </h1>
          <p className="lede">
            {placed.length} oferte de la restaurante, fast-food-uri și cofetării: pachete salvate de la aruncat, meniuri
            de prânz, reduceri.
            {snapshot.updatedAt && <> Actualizat {formatRelative(snapshot.updatedAt, now)}.</>}
          </p>
          <button type="button" className="locate" onClick={locateMe} disabled={locate === "locating"}>
            {locateLabel(locate, origin.mine)}
          </button>
          {locate === "denied" && (
            <p className="hint">Nu am primit locația. Permite accesul în browser sau mută harta; distanțele sunt calculate din centru.</p>
          )}
        </header>

        <fieldset className="filters">
          <legend className="sr-only">Filtre</legend>
          <div className="chip-row">
            {OFFER_KINDS.filter((kind) => kindCounts[kind]).map((kind) => (
              <button
                key={kind}
                type="button"
                className="chip"
                aria-pressed={kinds.includes(kind)}
                data-kind={kind}
                onClick={() => toggleKind(kind)}
              >
                {OFFER_KIND_LABELS[kind]} <span className="chip-count">{kindCounts[kind]}</span>
              </button>
            ))}
          </div>
          <div className="filter-line">
            <label>
              <span className="sr-only">Distanță</span>
              <select value={radiusKm ?? ""} onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : null)}>
                {RADII.map((r) => (
                  <option key={r.label} value={r.km ?? ""}>
                    {r.km === null ? r.label : `până la ${r.label}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Sortare</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={includeDelivery} onChange={(e) => setIncludeDelivery(e.target.checked)} />
              <span>și livrări</span>
            </label>
          </div>
        </fieldset>

        <div id="oferte" className="list">
          {selectedVenue && (
            <div className="venue-scope">
              <span>
                <strong>{selectedVenue.name}</strong> · {listed.length} {listed.length === 1 ? "ofertă" : "oferte"}
              </span>
              <button type="button" className="link-quiet" onClick={() => showVenue(null)}>
                Toate ofertele
              </button>
            </div>
          )}
          {listed.length === 0 ? (
            <div className="empty">
              <p>Nicio ofertă cu filtrele astea.</p>
              <button type="button" className="link-quiet" onClick={() => { setKinds([]); setRadiusKm(null); setVenueId(null); }}>
                Arată tot orașul
              </button>
            </div>
          ) : (
            listed.slice(0, visible).map((offer) => (
              <OfferCard key={offer.id} offer={offer} now={now} highlighted={offer.venueId === venueId} onShowVenue={showVenue} />
            ))
          )}
          {listed.length > visible && (
            <button type="button" className="more" onClick={() => setVisible((v) => v + PAGE)}>
              Încă {Math.min(PAGE, listed.length - visible)} din {listed.length - visible}
            </button>
          )}
          <footer className="colophon">
            Datele vin din aplicațiile și site-urile partenerilor; prețul și disponibilitatea finală sunt cele de acolo.
            Fiecare ofertă duce la sursa ei.
          </footer>
        </div>
      </section>

      <section className="map" aria-label="Hartă">
        <OfferMap pins={pins} origin={origin} selectedVenueId={venueId} onSelectVenue={showVenue} />
      </section>
    </div>
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
