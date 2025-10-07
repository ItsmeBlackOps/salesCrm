#!/usr/bin/env bash
set -euo pipefail

# Seeds the local Postgres using the running docker containers.
# Avoids requiring `psql` on the host.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"
SEED_SQL="$MONO_ROOT/Seed/seed.sql"

if [[ ! -f "$SEED_SQL" ]]; then
  echo "[db:seed] Seed file not found: $SEED_SQL" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[db:seed] DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

# Determine which container/user/db to target based on DATABASE_URL
CONTAINER=""
DB_USER=""
DB_NAME=""

if [[ "$DATABASE_URL" == *"localhost:5438"* || "$DATABASE_URL" == *"app_dev"* ]]; then
  CONTAINER="app_db_dev"
  DB_USER="dev"
  DB_NAME="app_dev"
elif [[ "$DATABASE_URL" == *"localhost:5439"* || "$DATABASE_URL" == *"app_test"* ]]; then
  CONTAINER="app_db_test"
  DB_USER="test"
  DB_NAME="app_test"
else
  echo "[db:seed] Unrecognized DATABASE_URL: $DATABASE_URL" >&2
  echo "[db:seed] Expected dev (5438/app_dev) or test (5439/app_test)." >&2
  exit 1
fi

echo "[db:seed] Applying $SEED_SQL to $CONTAINER ($DB_NAME as $DB_USER)"

# Pipe the SQL into psql within the Postgres container
cat "$SEED_SQL" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

echo "[db:seed] Done."

