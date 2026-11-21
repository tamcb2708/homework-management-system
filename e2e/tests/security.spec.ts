import { expect, test } from '@playwright/test';
import { login, PW } from './helpers';

test('unauthenticated users are sent to login; API refuses without session', async ({ page }) => {
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/login/);
  const r = await page.request.get('/api/teacher/dashboard');
  expect(r.status()).toBe(401);
});

test('a student cannot reach teacher/admin areas (UI redirect + API 403)', async ({ page }) => {
  await login(page, 'student2@demo.local', PW.student);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/student$/);
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(403);
  expect((await page.request.get('/api/teacher/assignments')).status()).toBe(403);
});

test('wrong password shows a generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mã trường').fill('demo');
  await page.getByLabel('Mã học sinh / Tên đăng nhập / Email').fill('HS0005');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.locator('form [role=alert]')).toHaveText('Thông tin đăng nhập không đúng.');
});

test('platform admin sees schools but not student work', async ({ page }) => {
  await page.goto('/platform/login');
  await page.getByLabel('Email').fill('platform.admin@demo.local');
  await page.getByLabel('Mật khẩu').fill(PW.platform);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan nền tảng' })).toBeVisible();
  await page.getByRole('link', { name: 'Trường học' }).click();
  await expect(page.getByRole('cell', { name: 'Trường THCS Demo' })).toBeVisible();
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(401);
});
