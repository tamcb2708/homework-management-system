-- Run once per database server as an administrator (psql -v ...). Passwords are passed as psql variables,
-- never committed. Creates the three roles used by the application (docs/architecture.md §3.6).
--   psql "$ADMIN_DATABASE_URL" -v owner_pw="..." -v app_pw="..." -v system_pw="..." -v db=hms -f scripts/sql/roles.sql
SELECT format('CREATE ROLE hms_owner LOGIN PASSWORD %L', :'owner_pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_owner') \gexec
SELECT format('CREATE ROLE hms_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_app') \gexec
SELECT format('CREATE ROLE hms_system LOGIN NOBYPASSRLS PASSWORD %L', :'system_pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_system') \gexec
SELECT format('CREATE DATABASE %I OWNER hms_owner', :'db') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO hms_app, hms_system', :'db') \gexec
