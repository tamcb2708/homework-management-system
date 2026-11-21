import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Minimal dotenv loader for tests (no extra dependency). */
export function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) process.env[m[1]] = m[2];
  }
}

export const TEST_ENV_FILE = join(__dirname, '..', '..', '.env.test');
