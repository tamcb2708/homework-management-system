import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, PW, uniq } from './helpers';

/**
 * WORKFLOW B (teacher) + WORKFLOW C (student), end-to-end on the real database:
 * create → questions → publish → student works, saves draft, submits → teacher grades, comments, publishes → student sees result.
 */
test.describe.serial('B + C: assignment lifecycle', () => {
  const title = `Bài E2E ${uniq()}`;
  let teacher: Page; let student: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    teacher = await (await browser.newContext()).newPage();
    student = await (await browser.newContext()).newPage();
  });

  test('B1–B3: teacher logs in, sees classes and students', async () => {
    await login(teacher, 'teacher1@demo.local', PW.teacher);
    await expect(teacher).toHaveURL(/\/teacher$/);
    await teacher.getByRole('link', { name: 'Lớp học' }).click();
    await teacher.getByText('Lớp 8A1').click();
    await expect(teacher.getByRole('cell', { name: 'Nguyễn Văn An' })).toBeVisible();
    await expect(teacher.getByText('Tỷ lệ hoàn thành')).toBeVisible();
  });

  test('B4–B8: create assignment, add questions, choose class, set due date, publish', async () => {
    await teacher.getByRole('link', { name: 'Bài tập' }).click();
    await teacher.getByRole('button', { name: 'Tạo bài tập' }).click();
    await teacher.getByLabel('Tiêu đề').fill(title);
    await teacher.getByRole('button', { name: 'Tạo và soạn câu hỏi' }).click();
    await expect(teacher.getByRole('heading', { name: title })).toBeVisible();

    await teacher.getByTestId('add-question').click();
    await teacher.getByTestId('question-content').fill('2 + 3 = ?');
    await teacher.getByTestId('question-points').fill('4');
    await teacher.getByTestId('option-0').fill('5');
    await teacher.getByTestId('option-1').fill('6');
    await teacher.getByTestId('save-question').click();
    await expect(teacher.getByText('Đã thêm câu hỏi')).toBeVisible();

    await teacher.getByTestId('add-question').click();
    await teacher.getByTestId('question-type').selectOption('ESSAY');
    await teacher.getByTestId('question-content').fill('Giải thích vì sao phép cộng có tính giao hoán.');
    await teacher.getByTestId('question-points').fill('6');
    await teacher.getByTestId('save-question').click();
    await expect(teacher.getByText('Tổng 10 điểm')).toBeVisible();

    await teacher.getByTestId('open-publish').click();
    await teacher.getByTestId('class-8A1').check();
    const due = new Date(Date.now() + 2 * 86400_000).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16).replace(' ', 'T');
    await teacher.getByTestId('due-at').fill(due);
    await teacher.getByTestId('confirm-publish').click();
    await expect(teacher.getByText('Đã giao bài cho học sinh')).toBeVisible();
    await expect(teacher.getByText('Đang giao')).toBeVisible();
  });

  test('B9: teacher tracks status – nobody started yet', async () => {
    await teacher.getByRole('link', { name: 'Bài nộp' }).click();
    await expect(teacher.getByRole('tab', { name: /Chưa bắt đầu/ })).toContainText('10');
  });

  test('C1–C3: student logs in, sees dashboard and the new assignment (with notification)', async () => {
    await login(student, 'student1@demo.local', PW.student);
    await expect(student).toHaveURL(/\/student$/);
    await expect(student.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
    await student.getByTestId('notification-bell').click();
    await expect(student.getByRole('menuitem', { name: new RegExp(`Bài tập mới: ${title}`) })).toBeVisible();
    await student.keyboard.press('Escape');
    await student.getByRole('link', { name: 'Bài tập của tôi' }).click();
    await student.getByRole('tab', { name: 'Chưa làm' }).click();
    await student.getByText(title).click();
  });

  test('C4–C7: student works, saves a draft, submits and sees the status', async () => {
    await student.getByTestId('start-assignment').click();
    await student.getByTestId('answer-option-0').check();
    await student.getByTestId('save-draft').click();
    await expect(student.getByTestId('save-state')).toContainText('Đã lưu nháp');
    await student.reload();
    await expect(student.getByTestId('answer-option-0')).toBeChecked(); // draft persisted server-side
    await student.getByTestId('next-question').click();
    await student.locator('.ProseMirror').click();
    await student.keyboard.type('Vì a + b và b + a cho cùng kết quả, thứ tự các số hạng không quan trọng.');
    await student.getByTestId('open-submit').click();
    await expect(student.getByText('Đã trả lời 2/2 câu.')).toBeVisible();
    await student.getByTestId('confirm-submit').click();
    await expect(student.getByText('Đã nộp bài thành công.')).toBeVisible();
    await expect(student.getByText(/Đã nộp lần 1/)).toBeVisible();
    await expect(student.getByText('Đang chờ giáo viên chấm.')).toBeVisible();
  });

  test('B10–B13: teacher sees the submission, grades, comments and publishes', async () => {
    await teacher.reload();
    await expect(teacher.getByRole('tab', { name: /Đã nộp/ })).toContainText('1');
    await teacher.getByTestId('grade-HS0001').click();
    await expect(teacher.getByText('Vì a + b và b + a')).toBeVisible();
    const essay = teacher.getByTestId('score-row-2');
    await essay.getByLabel('Điểm câu 2').fill('5');
    await essay.getByPlaceholder('Nhận xét cho câu này…').fill('Giải thích đúng, nên thêm ví dụ.');
    await essay.getByRole('button', { name: 'Lưu điểm' }).click();
    await expect(teacher.getByTestId('total-score')).toContainText('9');
    await teacher.getByTestId('overall-feedback').fill('Bài làm tốt, trình bày rõ ràng.');
    await teacher.getByRole('button', { name: 'Lưu nhận xét' }).click();
    await expect(teacher.getByText('Đã lưu nhận xét')).toBeVisible();
    await teacher.getByTestId('publish-grade').click();
    await teacher.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(teacher.getByText('Đã công bố điểm')).toBeVisible();
  });

  test('C8–C9: student sees the published score and the teacher feedback', async () => {
    await student.reload();
    await expect(student.getByTestId('result-score')).toContainText('9');
    await expect(student.getByTestId('teacher-feedback')).toHaveText('Bài làm tốt, trình bày rõ ràng.');
    await expect(student.getByText('Giải thích đúng, nên thêm ví dụ.')).toBeVisible();
    await student.getByTestId('notification-bell').click();
    await expect(student.getByRole('menuitem', { name: new RegExp(`Đã có điểm bài "${title}"`) })).toBeVisible();
  });
});
