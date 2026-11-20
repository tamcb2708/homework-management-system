import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = Object.fromEntries(readFileSync(join(__dirname, '../../apps/api/.env.e2e'), 'utf8').split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]));
export const PW = { platform: env.DEMO_PASSWORD_PLATFORM, admin: env.DEMO_PASSWORD_ADMIN, teacher: env.DEMO_PASSWORD_TEACHER, student: env.DEMO_PASSWORD_STUDENT };

export async function login(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Mã trường').fill('demo');
  await page.getByLabel('Mã học sinh / Tên đăng nhập / Email').fill(identifier);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export const uniq = () => Date.now().toString(36).slice(-5).toUpperCase();
