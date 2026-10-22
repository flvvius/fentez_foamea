import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { signOut, useSession } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/redirect";

/** Slim header shared by the feed, the map, the post form and the single deal page. */
export function SiteHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const user = session.data?.user;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        {/* A plain anchor: <Link> would mark the brand aria-current on "/", duplicating "Oferte". */}
        <a
          href="/"
          className="site-brand"
          onClick={(event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void navigate({ to: "/" });
          }}
        >
          fentez foamea
        </a>
        <nav aria-label="Principal" className="site-nav">
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>
            Oferte
          </Link>
          <Link to="/harta">Hartă</Link>
        </nav>
        <div className="site-auth">
          {session.isPending ? null : user ? (
            <>
              <span className="site-user" title={user.name}>
                {user.name}
              </span>
              <button type="button" className="link-quiet" onClick={() => void signOut()}>
                Ieși
              </button>
            </>
          ) : (
            <Link to="/autentificare" search={{ redirect: safeRedirect(pathname) }} className="link-quiet">
              Intră în cont
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
