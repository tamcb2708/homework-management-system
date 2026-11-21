import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** E2E runs the real stack (built API + built web) against a dedicated, freshly seeded database (hms_e2e). */
const root = join(__dirname, '..');
const envFile = join(root, 'apps/api/.env.e2e');
const env: Record<string, string> = {};
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m) env[m[1]] = m[2]; }
const WEB = Number(process.env.E2E_WEB_PORT ?? 3010);
const API = Number(env.PORT ?? 4010);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: join(root, 'playwright-report'), open: 'never' }]],
  use: { baseURL: `http://localhost:${WEB}`, trace: 'off', screenshot: 'only-on-failure', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
  ],
  webServer: [
    { command: 'bash ../../e2e/prepare-db.sh && node dist/main.js', cwd: join(root, 'apps/api'), port: API, env: { ...env, SCHEDULER_ENABLED: 'true', LOG_LEVEL: 'warn' }, reuseExistingServer: false, timeout: 180_000 },
    { command: `npx next start -p ${WEB}`, cwd: join(root, 'apps/web'), port: WEB, env: { API_INTERNAL_URL: `http://localhost:${API}` }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
