import { Suspense } from "react";
import { Explorer } from "@/components/Explorer";
import { getOfferSnapshot } from "@/lib/offers";

export default function Page() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <Offers />
    </Suspense>
  );
}

async function Offers() {
  const snapshot = await getOfferSnapshot();
  return <Explorer snapshot={snapshot} renderedAt={snapshot.updatedAt ?? "2026-01-01T00:00:00.000Z"} />;
}

function LoadingShell() {
  return (
    <div className="shell">
      <section className="panel">
        <header className="masthead">
          <p className="brand">fentez foamea</p>
          <h1 className="headline">
            Mâncare ieftină în București, <em>acum</em>.
          </h1>
          <p className="lede">Strângem ofertele…</p>
        </header>
      </section>
      <section className="map">
        <div className="map-placeholder" aria-hidden />
      </section>
    </div>
  );
}
