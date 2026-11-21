#!/usr/bin/env bash
# Deploys/updates the staging stack on a Docker host (VPS). Idempotent.
#   ./scripts/deploy-staging.sh            # build, migrate, start
#   SEED_DEMO=1 ./scripts/deploy-staging.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.docker}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy .env.docker.example)"; exit 1; }
grep -qE '^(JWT_SECRET|DB_APP_PASSWORD)=$' "$ENV_FILE" && { echo "Fill all secrets in $ENV_FILE first"; exit 1; }
DC="docker compose --env-file $ENV_FILE"
$DC build
$DC up -d postgres
$DC run --rm migrate
[ "${SEED_DEMO:-0}" = "1" ] && $DC run --rm seed
$DC up -d api web nginx
$DC ps
echo "Health: $(curl -fsS http://localhost/api/health/ready || echo 'not ready yet')"
