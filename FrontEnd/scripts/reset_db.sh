#!/usr/bin/env bash
set -euo pipefail

# Stops and removes the local Postgres containers and volumes
# used by Seed/docker-compose.test.yml.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"  # .../salesCrm/FrontEnd
MONO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"       # .../salesCrm
SEED_DIR="$MONO_ROOT/Seed"

echo "[db:reset] Stopping and removing containers + volumes..."
docker compose -f "$SEED_DIR/docker-compose.test.yml" down -v --remove-orphans
echo "[db:reset] Done. Containers and volumes removed."
echo "[db:reset] To start fresh DBs: \n  npm run setup:safe -- dev   # or test\n  # or: docker compose -f '$SEED_DIR/docker-compose.test.yml' up -d db_dev db_test"

