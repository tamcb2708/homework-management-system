import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { loadEnvFile, TEST_ENV_FILE } from './load-env';

/**
 * Recreates the integration-test database from migrations (real PostgreSQL, real RLS).
 * Requires apps/api/.env.test (see .env.example; DB_NAME must end with _test) and admin access
 * (ADMIN_DATABASE_URL or the local "postgres" OS user).
 */
export default async function globalSetup() {
  loadEnvFile(TEST_ENV_FILE);
  const db = process.env.DB_NAME ?? '';
  if (!db.endsWith('_test')) throw new Error(`Refusing to reset database "${db}" – DB_NAME must end with _test`);
  const root = join(__dirname, '..', '..', '..', '..');
  const sql = `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`;
  const admin = process.env.ADMIN_DATABASE_URL
    ? `psql "${process.env.ADMIN_DATABASE_URL}" -v ON_ERROR_STOP=1 -qc "${sql}"`
    : `su postgres -c 'psql -v ON_ERROR_STOP=1 -qc "${sql}"'`;
  execSync(admin, { stdio: 'inherit' });
  execSync(`bash scripts/db-setup.sh ${TEST_ENV_FILE}`, { cwd: root, stdio: 'pipe' });
}
