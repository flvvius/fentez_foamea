import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";
import { SITE_URL } from "@/lib/site";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function resolveBaseURL() {
  const configured = process.env.BETTER_AUTH_URL || undefined;
  if (process.env.VERCEL_ENV === "production") return configured ?? SITE_URL;
  if (process.env.VERCEL_ENV === "preview") {
    // Each preview deployment has its own *.vercel.app host. List only this deployment's
    // hosts: allowedHosts also become trusted origins, and "*.vercel.app" would trust any
    // site hosted on Vercel.
    const fallback =
      configured ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
    const hosts = [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      configured ? new URL(configured).host : undefined,
    ].filter((host): host is string => Boolean(host));
    return {
      allowedHosts: hosts,
      protocol: "https" as const,
      ...(fallback ? { fallback } : {}),
    };
  }
  return configured;
}

function buildAuth() {
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");

  const globalForPool = globalThis as unknown as { authPool?: Pool };
  if (!globalForPool.authPool) {
    const pool = new Pool({
      connectionString: required("DATABASE_URL"),
      max: 3,
      idleTimeoutMillis: 20_000,
    });
    // An idle client dropped by Postgres emits "error"; without a listener it crashes the process.
    pool.on("error", (error) => console.error("auth pool:", error.message));
    globalForPool.authPool = pool;
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  return betterAuth({
    baseURL: resolveBaseURL(),
    secret,
    database: globalForPool.authPool,
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {},
    rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limit" },
    advanced: {
      ipAddress: {
        // Only single-value headers are trusted (no trustedProxies: Vercel's proxy IPs are not
        // fixed). Vercel overwrites these headers with the real client address. Off Vercel the
        // site is not behind a trusted proxy, so only x-forwarded-for is read.
        ipAddressHeaders: process.env.VERCEL
          ? ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]
          : ["x-forwarded-for"],
      },
    },
    plugins: [tanstackStartCookies()],
  });
}

let instance: ReturnType<typeof buildAuth> | undefined;

/** Validates env and builds the auth instance on first use, so a missing variable only breaks auth routes. */
export function getAuth() {
  instance ??= buildAuth();
  return instance;
}
