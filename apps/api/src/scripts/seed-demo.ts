/**
 * Idempotent demo seed for STAGING / local preview only (never production data).
 * Business data is created through the real services (publish, submit, grade, publish grades), so demo state
 * follows the same rules as user actions. Re-running never duplicates rows.
 *
 * Passwords: DEMO_PASSWORD_{PLATFORM,ADMIN,TEACHER,STUDENT} if set; otherwise generated randomly for NEW accounts
 * and written to .demo-credentials.local (git-ignored). Existing passwords are kept unless the env vars are set.
 */
import 'reflect-metadata';
process.env.SCHEDULER_ENABLED = 'false';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '@prisma/client';
import { AppModule } from '../app.module';
import { DbService } from '../prisma/db.service';
import { runWithContext } from '../common/context';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { AssignmentsService } from '../assignments/assignments.service';
import { StudentService } from '../submissions/student.service';
import { TeacherGradingService } from '../grading/teacher-grading.service';
import { loadConfig } from '../config/env';

if (loadConfig().isProduction && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('Refusing to seed demo data with NODE_ENV=production (set ALLOW_DEMO_SEED=true for a staging deployment).');
  process.exit(1);
}

const SLUG = 'demo';
const STUDENT_NAMES = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Thu Dung', 'Hoàng Minh Đức', 'Vũ Ngọc Hà', 'Đặng Quốc Huy', 'Bùi Thanh Hương',
  'Đỗ Gia Khánh', 'Ngô Phương Linh', 'Dương Hải Long', 'Lý Bảo Ngọc', 'Mai Đức Phúc', 'Trịnh Như Quỳnh', 'Phan Anh Tuấn', 'Hồ Thảo Vy',
  'Tạ Minh Khôi', 'Chu Thị Lan', 'Lương Văn Nam', 'Cao Hà My',
];

const creds: Record<string, string> = {};
const day = 86400_000;

async function main() {
  try {
    await seed();
  } finally {
    writeCredentials();
  }
}

function writeCredentials() {
  const file = join(process.cwd(), '..', '..', '.demo-credentials.local');
  if (!Object.keys(creds).length) return console.log('No password changes (existing accounts kept their passwords).');
  const lines = ['# Demo credentials (STAGING ONLY – do not commit, do not reuse in production)', `# School code: ${SLUG}`, ...Object.entries(creds).map(([k, v]) => `${k}=${v}`)];
  writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600, flag: 'w' });
  console.log(`Credentials written to ${file}`);
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(DbService);
  const assignments = app.get(AssignmentsService);
  const students = app.get(StudentService);
  const grading = app.get(TeacherGradingService);
  const pw = async (envKey: string, label: string) => {
    const v = process.env[envKey];
    if (v) { creds[label] = v; return { hash: await hashPassword(v), set: true }; }
    const g = generateTemporaryPassword(14);
    return { hash: await hashPassword(g), set: false, generated: g };
  };

  // ── Platform admin ──
  const pPw = await pw('DEMO_PASSWORD_PLATFORM', 'platform.admin@demo.local');
  await db.system(async (tx) => {
    const ex = await tx.platformUser.findUnique({ where: { email: 'platform.admin@demo.local' } });
    if (!ex) {
      await tx.platformUser.create({ data: { email: 'platform.admin@demo.local', fullName: 'Quản trị Nền tảng (Demo)', passwordHash: pPw.hash } });
      creds['platform.admin@demo.local'] ??= pPw.generated!;
    } else if (pPw.set) await tx.platformUser.update({ where: { id: ex.id }, data: { passwordHash: pPw.hash, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0 } });
  });

  // ── Tenant ──
  const tenantId = await db.system(async (tx) => {
    const t = await tx.tenant.upsert({ where: { slug: SLUG }, create: { slug: SLUG, name: 'Trường THCS Demo', maxUsers: 500, maxStorageBytes: 2n * 1024n * 1024n * 1024n }, update: {} });
    await tx.tenantSettings.upsert({ where: { tenantId: t.id }, create: { tenantId: t.id }, update: {} });
    return t.id;
  });
  const sys = { requestId: 'seed', tenantId, system: true };

  // ── Users ──
  const sharedPw: Record<string, Awaited<ReturnType<typeof pw>>> = {
    ADMIN: await pw('DEMO_PASSWORD_ADMIN', 'admin@demo.local'),
    TEACHER: await pw('DEMO_PASSWORD_TEACHER', 'teacher*@demo.local'),
    STUDENT: await pw('DEMO_PASSWORD_STUDENT', 'student*@demo.local'),
  };
  const ensureUser = (u: { username: string; email: string; fullName: string; role: Role; studentCode?: string; teacherCode?: string; specialization?: string }) =>
    runWithContext(sys, () => db.tenant(async (tx) => {
      const key = u.role === 'SCHOOL_ADMIN' ? 'ADMIN' : u.role;
      const p = sharedPw[key];
      let user = await tx.user.findUnique({ where: { tenantId_username: { tenantId, username: u.username } } });
      if (!user) {
        user = await tx.user.create({
          data: {
            tenantId, username: u.username, email: u.email, fullName: u.fullName, passwordHash: p.hash, mustChangePassword: false,
            roles: { create: { role: u.role } },
            ...(u.role === 'STUDENT' ? { student: { create: { studentCode: u.studentCode! } } } : {}),
            ...(u.role === 'TEACHER' ? { teacher: { create: { teacherCode: u.teacherCode, specialization: u.specialization } } } : {}),
          },
        });
        if (!p.set) {
          const label = u.role === 'SCHOOL_ADMIN' ? 'admin@demo.local' : u.role === 'TEACHER' ? 'teacher*@demo.local' : 'student*@demo.local';
          creds[label] ??= p.generated!;
        }
      } else if (p.set) {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: p.hash, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0, mustChangePassword: false } });
      }
      return user.id;
    }));

  const adminId = await ensureUser({ username: 'admin@demo.local', email: 'admin@demo.local', fullName: 'Phạm Quốc Bảo (Quản trị trường)', role: 'SCHOOL_ADMIN' });
  const t1 = await ensureUser({ username: 'teacher1@demo.local', email: 'teacher1@demo.local', fullName: 'Nguyễn Thị Minh', role: 'TEACHER', teacherCode: 'GV001', specialization: 'Toán' });
  const t2 = await ensureUser({ username: 'teacher2@demo.local', email: 'teacher2@demo.local', fullName: 'Trần Văn Hùng', role: 'TEACHER', teacherCode: 'GV002', specialization: 'Ngữ văn' });
  const studentIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const code = `HS${String(i + 1).padStart(4, '0')}`;
    studentIds.push(await ensureUser({ username: code.toLowerCase(), email: `student${i + 1}@demo.local`, fullName: STUDENT_NAMES[i], role: 'STUDENT', studentCode: code }));
  }

  // ── Academics ──
  const ac = await runWithContext(sys, () => db.tenant(async (tx) => {
    const year = await tx.schoolYear.upsert({
      where: { tenantId_name: { tenantId, name: '2026–2027' } },
      create: { tenantId, name: '2026–2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-05-31'), isCurrent: true }, update: {},
    });
    for (const [ordinal, name, s, e] of [[1, 'Học kỳ I', '2026-09-01', '2027-01-15'], [2, 'Học kỳ II', '2027-01-16', '2027-05-31']] as const) {
      await tx.semester.upsert({ where: { schoolYearId_ordinal: { schoolYearId: year.id, ordinal } }, create: { tenantId, schoolYearId: year.id, ordinal, name, startDate: new Date(s), endDate: new Date(e) }, update: {} });
    }
    const math = await tx.subject.upsert({ where: { tenantId_code: { tenantId, code: 'TOAN' } }, create: { tenantId, code: 'TOAN', name: 'Toán' }, update: {} });
    const lit = await tx.subject.upsert({ where: { tenantId_code: { tenantId, code: 'VAN' } }, create: { tenantId, code: 'VAN', name: 'Ngữ văn' }, update: {} });
    const classes: string[] = [];
    for (const [code, homeroom] of [['8A1', t1], ['8A2', t2]] as const) {
      const c = await tx.class.upsert({
        where: { tenantId_schoolYearId_code: { tenantId, schoolYearId: year.id, code } },
        create: { tenantId, schoolYearId: year.id, code, name: `Lớp ${code}`, gradeLevel: 8, homeroomTeacherId: homeroom }, update: {},
      });
      classes.push(c.id);
    }
    for (const [i, sid] of studentIds.entries()) {
      const classId = classes[i < 10 ? 0 : 1];
      if (!(await tx.classStudent.findFirst({ where: { classId, studentId: sid, leftAt: null } }))) await tx.classStudent.create({ data: { tenantId, classId, studentId: sid } });
    }
    for (const [teacherId, subjectId] of [[t1, math.id], [t2, lit.id]]) {
      for (const classId of classes) {
        if (!(await tx.classTeacher.findFirst({ where: { classId, teacherId, subjectId, unassignedAt: null } }))) await tx.classTeacher.create({ data: { tenantId, classId, teacherId, subjectId } });
      }
    }
    return { math: math.id, lit: lit.id, classes };
  }));

  const as = (userId: string, roles: Role[], fn: () => Promise<any>) => runWithContext({ requestId: 'seed', tenantId, user: { id: userId, roles, fullName: 'seed', sessionId: 'seed' } }, fn);
  const exists = (owner: string, title: string) => runWithContext(sys, () => db.tenant((tx) => tx.assignment.findFirst({ where: { ownerTeacherId: owner, title, deletedAt: null } })));
  const now = Date.now();

  // ── A1: quiz, graded & published, then moved into the past ──
  const A1 = 'Trắc nghiệm Chương 1: Số hữu tỉ';
  if (!(await exists(t1, A1))) {
    const a = await as(t1, ['TEACHER'], () => assignments.create({ title: A1, subjectId: ac.math, description: 'Ôn tập kiến thức về số hữu tỉ và các phép toán.', instructions: 'Đọc kỹ từng câu, chọn đáp án đúng nhất.', topic: 'Chương 1', passScore: 5, answerVisibility: 'AFTER_PUBLISH' }));
    const q = (dto: any) => as(t1, ['TEACHER'], () => assignments.addQuestion(a.id, dto));
    await q({ type: 'SINGLE_CHOICE', content: 'Số nào sau đây là số hữu tỉ âm?', points: 2, options: [{ content: '3/4', isCorrect: false }, { content: '−2/5', isCorrect: true }, { content: '0', isCorrect: false }, { content: '√2', isCorrect: false }] });
    await q({ type: 'MULTIPLE_CHOICE', content: 'Chọn TẤT CẢ các số bằng 0,5:', points: 3, config: { scoring: 'PARTIAL' }, options: [{ content: '1/2', isCorrect: true }, { content: '2/4', isCorrect: true }, { content: '5/100', isCorrect: false }, { content: '50%', isCorrect: true }] });
    await q({ type: 'TRUE_FALSE', content: 'Mọi số nguyên đều là số hữu tỉ.', points: 2, options: [{ content: 'Đúng', isCorrect: true }, { content: 'Sai', isCorrect: false }] });
    const full = await q({ type: 'SHORT_ANSWER', content: 'Tính: 1/3 + 1/6 = ? (viết dưới dạng phân số tối giản)', points: 3, config: { accepted: ['1/2', '0.5', '0,5'], zeroIfNoMatch: true } });
    await as(t1, ['TEACHER'], () => assignments.publish(a.id, { classIds: ac.classes, studentIds: [], dueAt: new Date(now + 2 * day).toISOString() }));
    const qs = full.questions;
    const answer = (i: number) => {
      const right = i % 4 !== 3;
      return {
        [qs[0].id]: { selected: [qs[0].options[right ? 1 : 0].id] },
        [qs[1].id]: { selected: i % 3 === 0 ? [qs[1].options[0].id, qs[1].options[1].id, qs[1].options[3].id] : [qs[1].options[0].id, qs[1].options[1].id] },
        [qs[2].id]: { selected: [qs[2].options[i % 5 === 4 ? 1 : 0].id] },
        [qs[3].id]: { text: i % 2 === 0 ? '1/2' : '2/6' },
      };
    };
    const submitters = [...studentIds.slice(0, 8), ...studentIds.slice(10, 17)];
    for (const [i, sid] of submitters.entries()) {
      await as(sid, ['STUDENT'], async () => {
        const d = await students.start(a.id);
        await students.saveDraft(d.submission!.id, answer(i), d.submission!.draftRevision);
        await students.submit(d.submission!.id, `seed-a1-${sid}`);
      });
    }
    await as(t1, ['TEACHER'], () => grading.publishAll(a.id));
    // Move the whole window into the past so the assignment reads as finished.
    await runWithContext(sys, () => db.tenant(async (tx) => {
      await tx.assignment.update({ where: { id: a.id }, data: { openAt: new Date(now - 10 * day), publishedAt: new Date(now - 10 * day), dueAt: new Date(now - 3 * day), dueReminderSentAt: new Date(now - 4 * day) } });
      await tx.$executeRaw`UPDATE submissions SET started_at = now() - interval '5 days' WHERE assignment_id = ${a.id}::uuid`;
    }));
  }

  // ── A2: timed quiz, open ──
  const A2 = 'Kiểm tra 15 phút: Phân thức đại số';
  if (!(await exists(t1, A2))) {
    const a = await as(t1, ['TEACHER'], () => assignments.create({ title: A2, subjectId: ac.math, description: 'Bài kiểm tra ngắn có giới hạn thời gian 15 phút.', timeLimitMinutes: 15, passScore: 5, answerVisibility: 'AFTER_SUBMIT' }));
    const q = (dto: any) => as(t1, ['TEACHER'], () => assignments.addQuestion(a.id, dto));
    await q({ type: 'SINGLE_CHOICE', content: 'Phân thức (x² − 1)/(x − 1) rút gọn bằng:', points: 4, options: [{ content: 'x − 1', isCorrect: false }, { content: 'x + 1', isCorrect: true }, { content: 'x', isCorrect: false }] });
    await q({ type: 'TRUE_FALSE', content: 'Phân thức 0/(x+2) luôn bằng 0 với mọi x ≠ −2.', points: 2, options: [{ content: 'Đúng', isCorrect: true }, { content: 'Sai', isCorrect: false }] });
    await q({ type: 'SHORT_ANSWER', content: 'Điều kiện xác định của phân thức 1/(x − 3) là x ≠ ?', points: 4, config: { accepted: ['3'], numericTolerance: 0 } });
    await as(t1, ['TEACHER'], () => assignments.publish(a.id, { classIds: ac.classes, studentIds: [], dueAt: new Date(now + 5 * day).toISOString() }));
  }

  // ── A3: essay with rubric, open, some graded ──
  const A3 = 'Viết đoạn văn về bảo vệ môi trường';
  if (!(await exists(t2, A3))) {
    const a = await as(t2, ['TEACHER'], () => assignments.create({
      title: A3, subjectId: ac.lit, description: 'Viết đoạn văn nghị luận (200–300 chữ) nêu suy nghĩ của em về trách nhiệm bảo vệ môi trường.',
      instructions: 'Có mở đoạn, thân đoạn, kết đoạn. Nêu ít nhất một dẫn chứng thực tế.', topic: 'Văn nghị luận', passScore: 5, allowResubmit: true, maxAttempts: 2,
    }));
    const full = await as(t2, ['TEACHER'], () => assignments.addQuestion(a.id, {
      type: 'ESSAY', content: 'Viết đoạn văn trình bày suy nghĩ của em về vấn đề bảo vệ môi trường ở địa phương.', points: 10,
      referenceAnswer: 'Nêu thực trạng ô nhiễm; nguyên nhân; hậu quả; giải pháp cụ thể của học sinh (phân loại rác, trồng cây, hạn chế nhựa); liên hệ bản thân.',
      rubric: { criteria: [{ name: 'Nội dung', maxPoints: 4, description: 'Đủ ý, có dẫn chứng thực tế' }, { name: 'Lập luận', maxPoints: 2 }, { name: 'Bố cục', maxPoints: 2 }, { name: 'Ngôn ngữ', maxPoints: 1 }, { name: 'Sáng tạo', maxPoints: 1 }] },
    }));
    await as(t2, ['TEACHER'], () => assignments.publish(a.id, { classIds: ac.classes, studentIds: [], dueAt: new Date(now + 3 * day).toISOString() }));
    const essay = (n: string) => `Môi trường là ngôi nhà chung của chúng ta. Ở khu phố em, rác thải nhựa vẫn bị vứt bừa bãi gần bờ kênh, gây mùi hôi và tắc nghẽn dòng chảy. ` +
      `Nguyên nhân chủ yếu là ý thức của một số người còn kém. Theo em, mỗi học sinh có thể bắt đầu từ việc nhỏ: phân loại rác tại nhà, mang bình nước cá nhân và tham gia ngày chủ nhật xanh. ${n}`;
    const qid = full.questions[0].id;
    const subs: Record<string, string> = {};
    for (const [i, sid] of [studentIds[1], studentIds[2], studentIds[3], studentIds[11], studentIds[12], studentIds[13]].entries()) {
      await as(sid, ['STUDENT'], async () => {
        const d = await students.start(a.id);
        await students.saveDraft(d.submission!.id, { [qid]: { text: essay(i % 2 ? 'Em tin rằng nếu ai cũng chung tay, quê hương sẽ xanh sạch đẹp hơn.' : '') } }, d.submission!.draftRevision);
        await students.submit(d.submission!.id, `seed-a3-${sid}`);
        subs[sid] = d.submission!.id;
      });
    }
    // Teacher grades two essays with the rubric and publishes one; leaves the rest for the live demo.
    for (const [sid, scores, publish] of [[studentIds[1], [3.5, 1.5, 2, 1, 0.5], true], [studentIds[2], [3, 1.5, 1.5, 0.75, 0.5], false]] as const) {
      await as(t2, ['TEACHER'], async () => {
        const view = await grading.submissionView(subs[sid]);
        const q0 = view.questions[0];
        await grading.setScore(q0.grade!.detailId, { criteria: q0.rubric!.map((c: any, i: number) => ({ criterionId: c.id, score: scores[i] })), feedback: 'Đoạn văn có ý, cần thêm dẫn chứng số liệu cụ thể.' });
        await grading.setFeedback(view.grade!.id, { teacherFeedback: 'Bài viết mạch lạc. Hãy chú ý dùng từ nối giữa các câu để lập luận chặt chẽ hơn.' });
        if (publish) await grading.publish([view.grade!.id]);
      });
    }
  }

  // ── A4: file upload + short reflection, open ──
  const A4 = 'Nộp dàn ý bài văn nghị luận xã hội';
  if (!(await exists(t2, A4))) {
    const a = await as(t2, ['TEACHER'], () => assignments.create({ title: A4, subjectId: ac.lit, description: 'Lập dàn ý chi tiết và nộp dưới dạng tệp PDF hoặc DOCX.', topic: 'Văn nghị luận', answerVisibility: 'NEVER' }));
    await as(t2, ['TEACHER'], () => assignments.addQuestion(a.id, { type: 'FILE_UPLOAD', content: 'Tải lên dàn ý (PDF/DOCX, tối đa 2 tệp).', points: 8, config: { maxFiles: 2 } }));
    await as(t2, ['TEACHER'], () => assignments.addQuestion(a.id, { type: 'SHORT_ANSWER', content: 'Đề tài em chọn là gì?', points: 2, isRequired: true }));
    await as(t2, ['TEACHER'], () => assignments.publish(a.id, { classIds: ac.classes, studentIds: [], dueAt: new Date(now + 7 * day).toISOString(), allowLate: true, lateUntil: new Date(now + 9 * day).toISOString() }));
  }

  // ── A5: draft (mixed) for the teacher to finish & publish during the demo ──
  const A5 = 'Bài tập về nhà: Hằng đẳng thức đáng nhớ';
  if (!(await exists(t1, A5))) {
    const a = await as(t1, ['TEACHER'], () => assignments.create({ title: A5, subjectId: ac.math, description: 'Bài tập kết hợp trắc nghiệm và tự luận.', topic: 'Chương 2' }));
    await as(t1, ['TEACHER'], () => assignments.addQuestion(a.id, { type: 'SINGLE_CHOICE', content: '(a + b)² bằng:', points: 3, options: [{ content: 'a² + b²', isCorrect: false }, { content: 'a² + 2ab + b²', isCorrect: true }, { content: 'a² − 2ab + b²', isCorrect: false }] }));
    await as(t1, ['TEACHER'], () => assignments.addQuestion(a.id, { type: 'ESSAY', content: 'Chứng minh: (a − b)(a + b) = a² − b². Trình bày từng bước.', points: 7, referenceAnswer: 'Nhân phân phối: a² + ab − ab − b² = a² − b².' }));
  }

  await app.close();
  void adminId;
  console.log('Demo seed complete.');
}

main().catch((e) => {
  console.error('Seed failed:', e?.response ?? e?.message ?? e);
  process.exit(1);
});
