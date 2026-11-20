#!/usr/bin/env bash
# Creates roles + database (idempotent) and applies migrations.
# Usage: scripts/db-setup.sh [env-file]   (default: apps/api/.env)
# Needs either ADMIN_DATABASE_URL (a superuser/admin connection) or local access as the "postgres" OS user.
set -euo pipefail
ENV_FILE="${1:-apps/api/.env}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
: "${DB_NAME:?DB_NAME is required}" "${DB_OWNER_PASSWORD:?}" "${DB_APP_PASSWORD:?}" "${DB_SYSTEM_PASSWORD:?}" "${MIGRATION_DATABASE_URL:?}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
run_admin() {
  if [ -n "${ADMIN_DATABASE_URL:-}" ]; then psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"
  else su postgres -c "psql -v ON_ERROR_STOP=1 -q $(printf '%q ' "$@")"; fi
}
run_admin -v owner_pw="$DB_OWNER_PASSWORD" -v app_pw="$DB_APP_PASSWORD" -v system_pw="$DB_SYSTEM_PASSWORD" -v db="$DB_NAME" -f "$ROOT/scripts/sql/roles.sql"
cd "$ROOT/apps/api"
DATABASE_URL="$MIGRATION_DATABASE_URL" npx prisma migrate deploy
echo "Database $DB_NAME ready."
