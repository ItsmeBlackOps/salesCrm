#!/usr/bin/env bash
set -euo pipefail

# Runs Seed/check.sql against the running Postgres container for dev/test
# Chooses container based on $DATABASE_URL (same logic as seed.sh)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"
CHECK_SQL="$MONO_ROOT/Seed/check.sql"

if [[ ! -f "$CHECK_SQL" ]]; then
  echo "[db:check] Check file not found: $CHECK_SQL" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[db:check] DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

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
  echo "[db:check] Unrecognized DATABASE_URL: $DATABASE_URL" >&2
  echo "[db:check] Expected dev (5438/app_dev) or test (5439/app_test)." >&2
  exit 1
fi

echo "[db:check] Running $CHECK_SQL against $CONTAINER ($DB_NAME as $DB_USER)"

cat "$CHECK_SQL" | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"

echo "[db:check] Done."

