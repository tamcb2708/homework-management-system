#!/bin/bash
# Runs once on first container start (docker-entrypoint-initdb.d). Creates the three HMS roles and the database.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$DB_OWNER_PASSWORD" -v app_pw="$DB_APP_PASSWORD" -v system_pw="$DB_SYSTEM_PASSWORD" -v db="$DB_NAME" \
  -f /docker-entrypoint-initdb.d/roles.sql.txt
