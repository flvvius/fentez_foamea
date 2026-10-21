#!/bin/sh
set -e
for f in /docker-entrypoint-initdb.d/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
done
