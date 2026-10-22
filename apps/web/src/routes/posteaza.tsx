import { Link, createFileRoute } from "@tanstack/react-router";
import { PostForm } from "@/components/deals/PostForm";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/posteaza")({
  // A private page: nothing here should sit in a shared cache.
  headers: () => ({ "cache-control": "private, no-store" }),
  head: () => ({ meta: [{ title: "Postează o ofertă · fentez foamea" }, { name: "robots", content: "noindex" }] }),
  component: PostPage,
});

function PostPage() {
  const session = useSession();

  return (
    <>
      <SiteHeader />
      <main className="page">
        <p className="back">
          <Link to="/" className="link-quiet">
            ← Toate ofertele
          </Link>
        </p>
        <h1 className="headline">Postează o ofertă</h1>
        {session.isPending ? (
          <p className="lede" aria-live="polite">
            Se încarcă…
          </p>
        ) : session.data ? (
          <PostForm />
        ) : (
          <div className="empty">
            <p>Ca să postezi o ofertă trebuie să fii în cont.</p>
            <Link to="/autentificare" search={{ redirect: "/posteaza" }} className="btn-primary">
              Intră în cont
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
