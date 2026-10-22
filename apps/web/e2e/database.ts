import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/fentezfoamea_e2e";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export async function resetDatabase(): Promise<void> {
  await createDatabaseIfMissing(E2E_DATABASE_URL);
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema if exists public cascade; drop schema if exists extensions cascade; create schema public;");
    const bootstrap = readFileSync(`${repoRoot}supabase/local-bootstrap.sql`, "utf8").replace(
      "alter database fentezfoamea",
      `alter database ${new URL(E2E_DATABASE_URL).pathname.slice(1)}`,
    );
    await sql.unsafe(bootstrap);
    await sql.unsafe("set search_path = public, extensions");
    for (const file of readdirSync(`${repoRoot}supabase/migrations`).filter((name) => name.endsWith(".sql")).sort()) {
      await sql.unsafe(readFileSync(`${repoRoot}supabase/migrations/${file}`, "utf8"));
    }
    await sql.unsafe(readFileSync(fileURLToPath(new URL("./seed.sql", import.meta.url)), "utf8"));
  } finally {
    await sql.end();
  }
}

async function createDatabaseIfMissing(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`select 1 from pg_database where datname = ${name}`;
    if (!exists) await sql.unsafe(`create database "${name}"`);
  } finally {
    await sql.end();
  }
}
