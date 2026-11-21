import { expect, test } from '@playwright/test';
import { login, PW, uniq } from './helpers';

/** WORKFLOW A – School admin: login, dashboard, create class, create teacher, create student, add student to class. */
test('A: school admin manages accounts and classes', async ({ page }) => {
  const u = uniq();
  await login(page, 'admin@demo.local', PW.admin);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Tổng quan trường' })).toBeVisible();
  await expect(page.getByText('Học sinh', { exact: true }).first()).toBeVisible();

  // Create class
  await page.getByRole('link', { name: 'Lớp học' }).click();
  await page.getByRole('button', { name: 'Thêm lớp' }).click();
  await page.getByRole('textbox', { name: 'Mã lớp', exact: true }).fill(`9C${u}`.slice(0, 8));
  await page.getByRole('textbox', { name: 'Tên lớp', exact: true }).fill(`Lớp E2E ${u}`);
  await page.getByRole('button', { name: 'Tạo lớp' }).click();
  await expect(page.getByText('Đã tạo lớp')).toBeVisible();
  await expect(page.getByRole('cell', { name: `Lớp E2E ${u}`, exact: true })).toBeVisible();

  // Create teacher → temporary password shown once
  await page.getByRole('link', { name: 'Giáo viên' }).click();
  await page.getByRole('button', { name: 'Thêm giáo viên' }).click();
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill(`Giáo Viên ${u}`);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`gv${u.toLowerCase()}@demo.local`);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByTestId('temp-password')).toHaveText(/[A-Za-z0-9]{12}/);
  await page.getByRole('button', { name: 'Đã lưu, đóng' }).click();
  await page.getByPlaceholder('Tìm theo tên, email…').fill(u);
  await expect(page.getByRole('cell', { name: `Giáo Viên ${u}`, exact: true })).toBeVisible();

  // Create student (login by student code)
  await page.getByRole('link', { name: 'Học sinh' }).click();
  await page.getByRole('button', { name: 'Thêm học sinh' }).click();
  await page.getByRole('textbox', { name: 'Họ và tên', exact: true }).fill(`Học Sinh ${u}`);
  await page.getByRole('textbox', { name: 'Mã học sinh', exact: true }).fill(`HSE${u}`);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  const temp = await page.getByTestId('temp-password').innerText();
  expect(temp).not.toContain(`HSE${u}`);
  await page.getByRole('button', { name: 'Đã lưu, đóng' }).click();

  // Add the student to the new class
  await page.getByRole('link', { name: 'Lớp học' }).click();
  await page.getByRole('link', { name: `9C${u}`.slice(0, 8) }).click();
  await page.getByRole('button', { name: 'Thêm học sinh' }).click();
  await page.getByPlaceholder('Tìm theo tên hoặc mã HS…').fill(`HSE${u}`);
  await page.getByLabel(`Học Sinh ${u}`).check();
  await page.getByRole('button', { name: /Thêm 1 học sinh/ }).click();
  await expect(page.getByText('Đã thêm 1 học sinh')).toBeVisible();
  await expect(page.getByRole('cell', { name: `Học Sinh ${u}`, exact: true })).toBeVisible();
  await expect(page.getByText('Học sinh (1)')).toBeVisible();
});
