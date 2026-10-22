import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/redirect";
import { fetchAuthConfig } from "@/server/auth-config";

export const Route = createFileRoute("/autentificare")({
  // Better Auth appends its own `error=<code>` to errorCallbackURL, so the Google failure
  // flag uses a separate key.
  validateSearch: (search: Record<string, unknown>): { redirect?: string; google?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    google: search.google === "failed" ? "failed" : undefined,
  }),
  loader: () => fetchAuthConfig(),
  head: () => ({ meta: [{ title: "Autentificare · fentez foamea" }] }),
  component: AuthPage,
});

const SIGN_IN_FAILED = "Nu te-am putut autentifica. Încearcă din nou.";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email sau parolă incorectă.",
  INVALID_EMAIL: "Adresa de email nu este validă.",
  USER_ALREADY_EXISTS: "Există deja un cont cu acest email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Există deja un cont cu acest email.",
  PASSWORD_TOO_SHORT: "Parola trebuie să aibă cel puțin 10 caractere.",
  PASSWORD_TOO_LONG: "Parola este prea lungă.",
  EMAIL_NOT_VERIFIED: "Emailul nu este confirmat.",
};

function errorMessage(error: { status?: number; code?: string }): string {
  if (error.status === 429) return "Prea multe încercări. Așteaptă puțin și încearcă din nou.";
  return (error.code && ERROR_MESSAGES[error.code]) || SIGN_IN_FAILED;
}

const fieldClass =
  "block w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)]";
const buttonClass =
  "w-full rounded-[var(--radius-control)] px-4 py-2 font-medium disabled:opacity-60";

function AuthPage() {
  const { googleEnabled } = Route.useLoaderData();
  const { redirect, google: googleFailed } = Route.useSearch();
  const target = safeRedirect(redirect);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    googleFailed ? "Nu am putut porni autentificarea cu Google. Încearcă din nou." : null,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setPending(true);
    setError(null);
    const result =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name });
    setPending(false);
    if (result.error) {
      setError(errorMessage(result.error));
      return;
    }
    // Full navigation so the page reloads with the new session cookie.
    window.location.assign(target);
  }

  async function onGoogle() {
    setPending(true);
    setError(null);
    const errorURL = `/autentificare?${new URLSearchParams({ google: "failed", redirect: target })}`;
    const result = await signIn.social({
      provider: "google",
      callbackURL: target,
      errorCallbackURL: errorURL,
    });
    if (result?.error) {
      setPending(false);
      setError(errorMessage(result.error));
    }
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <a href="/" className="text-[var(--type-small)] text-[var(--muted-foreground)] underline">
        Înapoi la oferte
      </a>
      <h1 className="mt-6 mb-6 text-[var(--type-pageTitle)] font-semibold leading-tight">
        {mode === "in" ? "Intră în cont" : "Creează un cont"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "up" ? (
          <div>
            <label htmlFor="name" className="mb-1 block text-[var(--type-small)] font-medium">
              Nume
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className={fieldClass}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1 block text-[var(--type-small)] font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-[var(--type-small)] font-medium">
            Parolă
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={mode === "up" ? 10 : undefined}
            required
            aria-describedby={mode === "up" ? "password-hint" : undefined}
            className={fieldClass}
          />
          {mode === "up" ? (
            <p id="password-hint" className="mt-1 text-[var(--type-small)] text-[var(--muted-foreground)]">
              Cel puțin 10 caractere.
            </p>
          ) : null}
        </div>

        <p role="alert" className="min-h-6 text-[var(--type-small)] text-[var(--deal)]">
          {error}
        </p>

        <button
          type="submit"
          disabled={pending}
          className={`${buttonClass} bg-[var(--primary)] text-[var(--primary-foreground)]`}
        >
          {mode === "in" ? "Intră" : "Creează cont"}
        </button>
      </form>

      {googleEnabled ? (
        <button
          type="button"
          onClick={onGoogle}
          disabled={pending}
          className={`${buttonClass} mt-3 border border-[var(--input)] bg-[var(--background)] text-[var(--foreground)]`}
        >
          Continuă cu Google
        </button>
      ) : null}

      <p className="mt-6 text-[var(--type-small)] text-[var(--muted-foreground)]">
        {mode === "in" ? "Nu ai cont?" : "Ai deja cont?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setError(null);
          }}
          className="text-[var(--foreground)] underline"
        >
          {mode === "in" ? "Creează unul" : "Intră în cont"}
        </button>
      </p>
    </main>
  );
}
