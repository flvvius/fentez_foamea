import postgres from "postgres";

const globalForSql = globalThis as unknown as { sql?: postgres.Sql };

export function getSql(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForSql.sql ??= postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return globalForSql.sql;
}
