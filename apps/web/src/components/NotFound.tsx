import { Link } from "@tanstack/react-router";
import { OFFER_KIND_LABELS } from "@fentezfoamea/core";
import { LANDINGS } from "@/lib/landing";

export function NotFound() {
  return (
    <main className="not-found">
      <header className="masthead">
        <Link to="/" className="brand">
          fentez foamea
        </Link>
        <h1 className="headline">Pagina asta nu există.</h1>
        <p className="lede">Poate linkul e vechi sau greșit. Ofertele de azi sunt în continuare aici.</p>
        <div className="masthead-actions">
          <Link to="/harta" className="locate">
            Vezi ofertele de acum
          </Link>
        </div>
        <nav aria-label="Categorii" className="categories">
          {LANDINGS.map((landing) => (
            <Link key={landing.slug} to="/$categorie" params={{ categorie: landing.slug }} className="link-quiet">
              {OFFER_KIND_LABELS[landing.kind]}
            </Link>
          ))}
        </nav>
      </header>
    </main>
  );
}
