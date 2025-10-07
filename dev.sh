#!/usr/bin/env bash
set -euo pipefail

# One-command dev: DB up + migrate + seed + check + start Backend & FrontEnd
# Usage: ./dev.sh [dev|test]

ENV_NAME="${1:-dev}"
if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "test" ]]; then
  echo "Usage: $0 [dev|test]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FE_DIR="$ROOT_DIR/FrontEnd"
BE_DIR="$ROOT_DIR/BackEnd"

echo "[dev] Safe setup ($ENV_NAME): DB up, migrate, seed"
pushd "$FE_DIR" >/dev/null
  bash scripts/safe_dev_setup.sh "$ENV_NAME"
  echo "[dev] Running DB check"
  npm run db:check
popd >/dev/null

# Backend setup (use isolated api_dev/api_test database)
DB_URL_DEV="postgres://dev:dev@localhost:5438/api_dev"
DB_URL_TEST="postgres://test:test@localhost:5439/api_test"
BE_DB_URL="$DB_URL_DEV"
if [[ "$ENV_NAME" == "test" ]]; then
  BE_DB_URL="$DB_URL_TEST"
fi

echo "[dev] Backend env prep (.env)"
if [[ ! -f "$BE_DIR/.env" ]]; then
  cp "$BE_DIR/.env.example" "$BE_DIR/.env"
fi
if rg -q "^DATABASE_URL=" "$BE_DIR/.env"; then
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$BE_DB_URL|" "$BE_DIR/.env"
else
  printf "\nDATABASE_URL=%s\n" "$BE_DB_URL" >> "$BE_DIR/.env"
fi

echo "[dev] Backend deps + prisma generate + db push"
pushd "$BE_DIR" >/dev/null
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npx prisma generate
  # Use db push to create schema in fresh api_dev/api_test without conflicting with FrontEnd demo tables
  npx prisma db push
popd >/dev/null

echo "[dev] Starting Backend and FrontEnd dev servers..."

# Start backend and frontend concurrently; stop both on exit
cleanup() { echo "[dev] Shutting down dev servers"; kill 0; }
trap cleanup EXIT INT TERM

NODE_ENV=development PORT=3005 DATABASE_URL="$BE_DB_URL" bash -lc "cd '$BE_DIR' && npm run dev" &
cd "$FE_DIR" && npm run dev

