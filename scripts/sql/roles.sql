-- Run once per database server as an administrator (psql -v ...). Passwords are passed as psql variables,
-- never committed. Creates the three roles used by the application (docs/architecture.md §3.6).
--   psql "$ADMIN_DATABASE_URL" -v owner_pw="..." -v app_pw="..." -v system_pw="..." -v db=hms -f scripts/sql/roles.sql
SELECT format('CREATE ROLE hms_owner LOGIN PASSWORD %L', :'owner_pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_owner') \gexec
SELECT format('CREATE ROLE hms_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_app') \gexec
SELECT format('CREATE ROLE hms_system LOGIN NOBYPASSRLS PASSWORD %L', :'system_pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_system') \gexec
-- Keep passwords in sync with the environment (role may pre-exist from an earlier deployment).
SELECT format('ALTER ROLE hms_owner PASSWORD %L', :'owner_pw') \gexec
SELECT format('ALTER ROLE hms_app PASSWORD %L', :'app_pw') \gexec
SELECT format('ALTER ROLE hms_system PASSWORD %L', :'system_pw') \gexec
-- Managed PostgreSQL (Neon, RDS…): the admin is not a superuser, so it must be a member of hms_owner
-- before it can create a database owned by that role (PostgreSQL 16+ does not grant this implicitly).
SELECT format('GRANT hms_owner TO %I WITH SET TRUE', current_user)
  WHERE current_setting('server_version_num')::int >= 160000 AND CASE WHEN current_setting('server_version_num')::int >= 160000 THEN NOT pg_has_role(current_user, 'hms_owner', 'SET') ELSE false END \gexec
SELECT format('GRANT hms_owner TO %I', current_user)
  WHERE current_setting('server_version_num')::int < 160000 AND NOT pg_has_role(current_user, 'hms_owner', 'MEMBER') \gexec
SELECT format('CREATE DATABASE %I OWNER hms_owner', :'db') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO hms_app, hms_system', :'db') \gexec
