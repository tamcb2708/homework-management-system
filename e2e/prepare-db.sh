#!/usr/bin/env bash
# Recreates hms_e2e from migrations and seeds demo data (run before the E2E API starts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/apps/api/.env.e2e"
SQL='DROP DATABASE IF EXISTS hms_e2e WITH (FORCE);'
if [ -n "${ADMIN_DATABASE_URL:-}" ]; then psql "$ADMIN_DATABASE_URL" -qc "$SQL"; else su postgres -c "psql -qc \"$SQL\""; fi
bash "$ROOT/scripts/db-setup.sh" "$ENV_FILE" > /dev/null
cd "$ROOT/apps/api" && set -a && . "$ENV_FILE" && set +a && node dist/scripts/seed-demo.js > /dev/null
