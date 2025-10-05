#!/usr/bin/env bash
set -euo pipefail

# Safe Dev/Test setup script
# - Spins up local Postgres containers
# - Creates a local env file if missing
# - Exports DATABASE_URL for seeding based on env arg
# - Runs db:migrate and db:seed

usage() {
  cat <<EOF
Usage: $0 [dev|test]

Sets up local synthetic DBs and seeds data without real URIs.

Examples:
  $0 dev   # use dev DB (localhost:5438)
  $0 test  # use test DB (localhost:5439)
EOF
}

ENV_NAME="${1:-dev}"
if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "test" ]]; then
  echo "Invalid environment: $ENV_NAME" >&2
  usage
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)" # .../salesCRM/FrontEnd
MONO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"       # .../salesCRM
SEED_DIR="$MONO_ROOT/Seed"

echo "[safe-setup] Bringing up postgres containers..."
docker compose -f "$SEED_DIR/docker-compose.test.yml" up -d db_dev db_test

# Wait for container readiness (simple loop on ports)
echo "[safe-setup] Waiting for DB ports..."
for i in {1..30}; do
  DEV_OK=0
  TEST_OK=0
  (echo > /dev/tcp/127.0.0.1/5438) >/dev/null 2>&1 && DEV_OK=1 || true
  (echo > /dev/tcp/127.0.0.1/5439) >/dev/null 2>&1 && TEST_OK=1 || true
  if [[ $DEV_OK -eq 1 && $TEST_OK -eq 1 ]]; then
    break
  fi
  sleep 1
done

ENV_FILE="$ROOT_DIR/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[safe-setup] Creating $ENV_FILE (fake URIs)..."
  cat > "$ENV_FILE" <<ENV
DB_ENV=$ENV_NAME
DATABASE_URL_DEV=postgres://dev:dev@localhost:5438/app_dev
DATABASE_URL_TEST=postgres://test:test@localhost:5439/app_test
FEATURE_DIAGNOSTICS=false
ENV
else
  echo "[safe-setup] Found existing .env.local"
fi

if [[ "$ENV_NAME" == "dev" ]]; then
  export DATABASE_URL="postgres://dev:dev@localhost:5438/app_dev"
else
  export DATABASE_URL="postgres://test:test@localhost:5439/app_test"
fi

echo "[safe-setup] DATABASE_URL=$DATABASE_URL"

echo "[safe-setup] Running migrations..."
cd "$ROOT_DIR"
npm run db:migrate || true

echo "[safe-setup] Seeding synthetic data..."
npm run db:seed

echo "[safe-setup] Done. Next steps:\n- npm run lint\n- npm run typecheck\n- npm test\n- npm run e2e (optional)"
