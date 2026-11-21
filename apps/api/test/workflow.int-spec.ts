import type { INestApplication } from '@nestjs/common';
import { Client, createApp, createTenant, inDays, publishedAssignment, TenantFixture, uid } from './helpers';
import type { DbService } from '../src/prisma/db.service';

/** End-to-end business flows 2–4, 6–19 at API level, asserting database state (not only HTTP 200). */
describe('Assignment → submission → grading → publication', () => {
  let app: INestApplication; let db: DbService; let f: TenantFixture;
  let admin: Client, teacher: Client, s1: Client, s2: Client, outsider: Client;
  let asg: Awaited<ReturnType<typeof publishedAssignment>>;

  beforeAll(async () => {
    ({ app, db } = await createApp());
    f = await createTenant(db, 'flow');
    admin = new Client(app); await admin.login('flow', 'admin@flow.test');
    teacher = new Client(app); await teacher.login('flow', 'teacher@flow.test');
    s1 = new Client(app); await s1.login('flow', 'HS0001');
    s2 = new Client(app); await s2.login('flow', 'HS0002');
    outsider = new Client(app); await outsider.login('flow', 'HS0099');
  });
  afterAll(() => app.close());

  it('admin creates a teacher (temp password, hashed) and a class, adds a student (flows 2–4)', async () => {
    const t = await admin.post('/api/admin/users/teachers', { fullName: 'Lê Văn Tâm', email: 'tam@flow.test' });
    expect(t.status).toBe(201);
    expect(t.body.temporaryPassword).toHaveLength(12);
    const row = await db.system((tx) => tx.user.findUniqueOrThrow({ where: { id: t.body.id }, include: { roles: true, teacher: true } }));
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(row.mustChangePassword).toBe(true);
    expect(row.roles.map((r) => r.role)).toEqual(['TEACHER']);
    expect(row.teacher).not.toBeNull();

    const st = await admin.post('/api/admin/users/students', { fullName: 'Học Sinh Mới', studentCode: 'HS0500' });
    expect(st.body.temporaryPassword).not.toMatch(/hs0500/i);
    const dup = await admin.post('/api/admin/users/students', { fullName: 'Trùng', studentCode: 'hs0500' });
    expect(dup.status).toBe(409);

    const c = await admin.post('/api/admin/classes', { code: '8B1', name: 'Lớp 8B1', schoolYearId: f.yearId, gradeLevel: 8 });
    expect(c.status).toBe(201);
    expect((await admin.post(`/api/admin/classes/${c.body.id}/students`, { studentIds: [st.body.id] })).body).toEqual({ added: 1, skipped: 0 });
    expect((await admin.post(`/api/admin/classes/${c.body.id}/students`, { studentIds: [st.body.id] })).body).toEqual({ added: 0, skipped: 1 });
    expect((await admin.post(`/api/admin/classes/${c.body.id}/teachers`, { teacherId: t.body.id, subjectId: f.subjectId })).status).toBe(201);
    const detail = (await admin.get(`/api/admin/classes/${c.body.id}`)).body;
    expect(detail.students).toHaveLength(1);
    expect(detail.teachers[0].subject.code).toBe('TOAN');
    expect(await db.system((tx) => tx.auditLog.count({ where: { tenantId: f.id, action: { in: ['user.create', 'class.create', 'class.enroll'] } } }))).toBeGreaterThanOrEqual(4);
  });

  it('teacher validation: cannot publish without questions, wrong answer keys, or to classes not taught', async () => {
    const a = (await teacher.post('/api/teacher/assignments', { title: 'Rỗng', subjectId: f.subjectId })).body;
    const p = await teacher.post(`/api/teacher/assignments/${a.id}/publish`, { classIds: [f.classId], studentIds: [], dueAt: inDays(1) });
    expect(p.status).toBe(422);
    const bad = await teacher.post(`/api/teacher/assignments/${a.id}/questions`, { type: 'SINGLE_CHOICE', content: 'x', points: 1, options: [{ content: 'a', isCorrect: true }, { content: 'b', isCorrect: true }] });
    expect(bad.body.error.code).toBe('INVALID_ANSWER_KEY');
    await teacher.post(`/api/teacher/assignments/${a.id}/questions`, { type: 'TRUE_FALSE', content: 'x', points: 1, options: [{ content: 'Đúng', isCorrect: true }, { content: 'Sai', isCorrect: false }] });
    expect((await teacher.post(`/api/teacher/assignments/${a.id}/publish`, { classIds: [f.otherClassId], studentIds: [], dueAt: inDays(1) })).status).toBe(422);
    const rub = await teacher.post(`/api/teacher/assignments/${a.id}/questions`, { type: 'ESSAY', content: 'e', points: 5, rubric: { criteria: [{ name: 'A', maxPoints: 2 }] } });
    expect(rub.body.error.code).toBe('RUBRIC_TOTAL');
  });

  it('teacher creates and publishes; only targeted students see it; answers are never leaked (flows 6, 7, 9)', async () => {
    asg = await publishedAssignment(teacher, f);
    expect((await db.system((tx) => tx.assignment.findUniqueOrThrow({ where: { id: asg.id } }))).maxScore.toNumber()).toBe(10);
    expect(await db.system((tx) => tx.notification.count({ where: { tenantId: f.id, type: 'ASSIGNMENT_PUBLISHED', link: { contains: asg.id } } }))).toBe(3);
    const list = (await s1.get('/api/student/assignments')).body;
    expect(list.map((x: any) => x.id)).toContain(asg.id);
    expect((await outsider.get('/api/student/assignments')).body).toHaveLength(0);
    expect((await outsider.get(`/api/student/assignments/${asg.id}`)).status).toBe(404);
    const detail = await s1.get(`/api/student/assignments/${asg.id}`);
    const raw = JSON.stringify(detail.body);
    expect(raw).not.toMatch(/isCorrect|referenceAnswer|"config"/);
  });

  it('student works with autosave; stale tab is rejected; required question enforced (flows 10, 11)', async () => {
    const d = (await s1.post(`/api/student/assignments/${asg.id}/start`)).body;
    const sid = d.submission.id;
    const [q1, q2] = asg.questions;
    const right = q1.options.find((o) => o.isCorrect)!.id;
    const save = await s1.put(`/api/student/submissions/${sid}/draft`, { answers: { [q1.id]: { selected: [right] } }, revision: d.submission.draftRevision });
    expect(save.status).toBe(200);
    expect((await s1.put(`/api/student/submissions/${sid}/draft`, { answers: {}, revision: d.submission.draftRevision })).body.error.code).toBe('STALE_DRAFT');
    const draftRow = await db.system((tx) => tx.submission.findUniqueOrThrow({ where: { id: sid } }));
    expect((draftRow.draft as any)[q1.id].selected).toEqual([right]);
    const missing = await s1.post(`/api/student/submissions/${sid}/submit`, {}, { headers: { 'Idempotency-Key': uid() } });
    expect(missing.body.error.code).toBe('REQUIRED_MISSING');
    await s1.put(`/api/student/submissions/${sid}/draft`, {
      answers: { [q1.id]: { selected: [right] }, [q2.id]: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quy đồng mẫu rồi cộng tử.' }] }, { type: 'script' }] } } },
      revision: save.body.revision,
    });
    // Duplicate submit (double click): exactly one version (flow 12, E1)
    const key = uid();
    const [r1, r2] = await Promise.all([
      s1.post(`/api/student/submissions/${sid}/submit`, {}, { headers: { 'Idempotency-Key': key } }),
      s1.post(`/api/student/submissions/${sid}/submit`, {}, { headers: { 'Idempotency-Key': key } }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await db.system((tx) => tx.submissionVersion.count({ where: { submissionId: sid } }))).toBe(1);
    expect((await s1.post(`/api/student/submissions/${sid}/submit`, {}, { headers: { 'Idempotency-Key': uid() } })).body.error.code).toBe('ALREADY_SUBMITTED');
    expect((await s1.put(`/api/student/submissions/${sid}/draft`, { answers: {}, revision: 99 })).body.error.code).toBe('NOT_EDITABLE');
    const ans = await db.system((tx) => tx.submissionAnswer.findFirstOrThrow({ where: { questionId: q2.id } }));
    expect(JSON.stringify(ans.answer)).not.toContain('script');
    expect(ans.answerText).toContain('Quy đồng mẫu');
  });

  it('auto-grades deterministic questions, essay waits for the teacher, teacher notified (flow 13)', async () => {
    const g = await db.system((tx) => tx.grade.findFirstOrThrow({ where: { submission: { assignmentId: asg.id, studentId: f.studentIds[0] } }, include: { details: true } }));
    const sc = g.details.find((d) => d.questionId === asg.questions[0].id)!;
    const essay = g.details.find((d) => d.questionId === asg.questions[1].id)!;
    expect(sc.status).toBe('AUTO_GRADED');
    expect(sc.earnedScore!.toNumber()).toBe(2);
    expect(essay.status).toBe('NEEDS_MANUAL');
    expect(essay.earnedScore).toBeNull();
    expect(g.status).toBe('IN_PROGRESS');
    expect(await db.system((tx) => tx.notification.count({ where: { userId: f.teacherId, type: 'SUBMISSION_RECEIVED' } }))).toBe(1);
    const roster = (await teacher.get(`/api/teacher/assignments/${asg.id}/roster`)).body;
    expect(roster.rows.find((r: any) => r.studentId === f.studentIds[0]).status).toBe('SUBMITTED');
    expect(roster.rows.find((r: any) => r.studentId === f.studentIds[1]).status).toBe('NOT_STARTED');
  });

  it('student cannot see results before publication; cannot call teacher APIs (flow 20)', async () => {
    const sub = await db.system((tx) => tx.submission.findFirstOrThrow({ where: { assignmentId: asg.id, studentId: f.studentIds[0] } }));
    expect((await s1.get(`/api/student/submissions/${sub.id}/result`)).status).toBe(404);
    expect((await s1.get(`/api/teacher/submissions/${sub.id}`)).status).toBe(403);
    const detail = await db.system((tx) => tx.gradeDetail.findFirstOrThrow({ where: { grade: { submissionId: sub.id }, status: 'NEEDS_MANUAL' } }));
    expect((await s1.put(`/api/teacher/grade-details/${detail.id}`, { score: 8 })).status).toBe(403);
    expect((await s2.get(`/api/student/submissions/${sub.id}/result`)).status).toBe(404);
  });

  it('teacher grades the essay by rubric, edits feedback, overrides auto score with reason, then publishes (flows 15–17)', async () => {
    const sub = await db.system((tx) => tx.submission.findFirstOrThrow({ where: { assignmentId: asg.id, studentId: f.studentIds[0] } }));
    const view = (await teacher.get(`/api/teacher/submissions/${sub.id}`)).body;
    expect(view.ai.enabled).toBe(false);
    const essay = view.questions[1];
    const crit = essay.rubric;
    expect((await teacher.put(`/api/teacher/grade-details/${essay.grade.detailId}`, { criteria: [{ criterionId: crit[0].id, score: 6 }, { criterionId: crit[1].id, score: 2 }] })).body.error.code).toBe('SCORE_OUT_OF_RANGE');
    expect((await teacher.put(`/api/teacher/grade-details/${essay.grade.detailId}`, { criteria: [{ criterionId: crit[0].id, score: 4.1 }, { criterionId: crit[1].id, score: 2 }] })).body.error.code).toBe('SCORE_STEP');
    const ok = await teacher.put(`/api/teacher/grade-details/${essay.grade.detailId}`, { criteria: [{ criterionId: crit[0].id, score: 4.5 }, { criterionId: crit[1].id, score: 2 }], feedback: 'Cần ví dụ.' });
    expect(ok.status).toBe(200);
    expect(ok.body.grade.status).toBe('GRADED');
    expect(ok.body.grade.earnedScore).toBe(8.5);
    const sc = view.questions[0];
    expect((await teacher.put(`/api/teacher/grade-details/${sc.grade.detailId}`, { score: 1.5 })).body.error.code).toBe('REASON_REQUIRED');
    const over = await teacher.put(`/api/teacher/grade-details/${sc.grade.detailId}`, { score: 1.5, reason: 'Trình bày thiếu' });
    expect(over.body.grade.earnedScore).toBe(8);
    await teacher.put(`/api/teacher/grades/${ok.body.grade.id}/feedback`, { teacherFeedback: 'Làm tốt, cần cẩn thận hơn.' });
    const hist = await db.system((tx) => tx.gradeHistory.findMany({ where: { gradeId: ok.body.grade.id } }));
    expect(hist.map((h) => h.changeType).sort()).toEqual(['AUTO_GRADED', 'FEEDBACK_EDITED', 'MANUAL_SET', 'OVERRIDE_AUTO']);
    expect(hist.find((h) => h.changeType === 'OVERRIDE_AUTO')!.reason).toBe('Trình bày thiếu');
    const crits = await db.system((tx) => tx.gradeDetailCriterion.count({ where: { gradeDetailId: essay.grade.detailId } }));
    expect(crits).toBe(2);
    const rubricLocked = await db.system((tx) => tx.rubric.findFirstOrThrow({ where: { questions: { some: { id: essay.id } } } }));
    expect(rubricLocked.lockedAt).not.toBeNull();

    const pub = await teacher.post('/api/teacher/grades/publish', { gradeIds: [ok.body.grade.id] });
    expect(pub.body.published).toEqual([ok.body.grade.id]);
    const after = await db.system((tx) => tx.submission.findUniqueOrThrow({ where: { id: sub.id } }));
    expect(after.status).toBe('PUBLISHED');
    expect(after.effectiveGradeId).toBe(ok.body.grade.id);
    expect(await db.system((tx) => tx.notification.count({ where: { userId: f.studentIds[0], type: 'GRADE_PUBLISHED' } }))).toBe(1);
  });

  it('student sees the published result with feedback; AI feedback hidden by default (flows 18, 19)', async () => {
    const sub = await db.system((tx) => tx.submission.findFirstOrThrow({ where: { assignmentId: asg.id, studentId: f.studentIds[0] } }));
    const r = (await s1.get(`/api/student/submissions/${sub.id}/result`)).body;
    expect(r.earnedScore).toBe(8);
    expect(r.maxScore).toBe(10);
    expect(r.passed).toBe(true);
    expect(r.teacherFeedback).toBe('Làm tốt, cần cẩn thận hơn.');
    expect(r.aiFeedback).toBeNull();
    expect(r.questions[1].criteria).toHaveLength(2);
    expect(r.questions[1].feedback).toBe('Cần ví dụ.');
    expect(r.answerKeyVisible).toBe(true); // AFTER_PUBLISH
    const notif = (await s1.get('/api/notifications')).body;
    expect(notif.items.some((n: any) => n.type === 'GRADE_PUBLISHED')).toBe(true);
    expect(notif.unreadCount).toBeGreaterThan(0);
    await s1.post('/api/notifications/read-all');
    expect((await s1.get('/api/notifications/unread-count')).body.count).toBe(0);
  });

  it('editing a published grade requires a reason and notifies the student (BR-35)', async () => {
    const sub = await db.system((tx) => tx.submission.findFirstOrThrow({ where: { assignmentId: asg.id, studentId: f.studentIds[0] } }));
    const view = (await teacher.get(`/api/teacher/submissions/${sub.id}`)).body;
    const sc = view.questions[0];
    expect((await teacher.put(`/api/teacher/grade-details/${sc.grade.detailId}`, { score: 2 })).body.error.code).toBe('REASON_REQUIRED');
    const r = await teacher.put(`/api/teacher/grade-details/${sc.grade.detailId}`, { score: 2, reason: 'Phúc khảo' });
    expect(r.body.grade.earnedScore).toBe(8.5);
    expect(await db.system((tx) => tx.notification.count({ where: { userId: f.studentIds[0], type: 'GRADE_UPDATED' } }))).toBe(1);
  });

  it('resubmission is refused unless the teacher enabled it (D6.3)', async () => {
    expect((await s1.post(`/api/student/assignments/${asg.id}/start`)).body.error.code).toBe('RESUBMIT_NOT_ALLOWED');
  });

  it('teacher can request a resubmission; new version kept alongside the old one; latest version counts (D6.1, D6.2)', async () => {
    const r = await teacher.post(`/api/teacher/assignments/${asg.id}/return`, { studentId: f.studentIds[0], reason: 'Bổ sung ví dụ minh họa' });
    expect(r.status).toBe(200);
    const d = (await s1.post(`/api/student/assignments/${asg.id}/start`)).body;
    expect(d.submission.returnedReason).toBe('Bổ sung ví dụ minh họa');
    expect(Object.keys(d.submission.draft)).toHaveLength(2); // prefilled from previous version
    await s1.post(`/api/student/submissions/${d.submission.id}/submit`, {}, { headers: { 'Idempotency-Key': uid() } });
    const versions = await db.system((tx) => tx.submissionVersion.findMany({ where: { submissionId: d.submission.id }, orderBy: { versionNo: 'asc' } }));
    expect(versions.map((v) => [v.versionNo, v.countsAsAttempt])).toEqual([[1, true], [2, false]]);
    // old published grade stays effective until the new one is published (O-09)
    const s = await db.system((tx) => tx.submission.findUniqueOrThrow({ where: { id: d.submission.id }, include: { grades: true } }));
    expect(s.grades).toHaveLength(2);
    expect(s.grades.find((g) => g.id === s.effectiveGradeId)!.submissionVersionId).toBe(versions[0].id);
  });

  it('late submission is rejected after the deadline when late work is not allowed (E2)', async () => {
    const d = (await s2.post(`/api/student/assignments/${asg.id}/start`)).body;
    await db.system((tx) => tx.assignment.update({ where: { id: asg.id }, data: { openAt: new Date(Date.now() - 3 * 86400_000), dueAt: new Date(Date.now() - 3600_000) } }));
    const r = await s2.post(`/api/student/submissions/${d.submission.id}/submit`, {}, { headers: { 'Idempotency-Key': uid() } });
    expect(r.body.error.code).toBe('DEADLINE_PASSED');
    expect(await db.system((tx) => tx.submissionVersion.count({ where: { submissionId: d.submission.id } }))).toBe(0);
    await db.system((tx) => tx.assignment.update({ where: { id: asg.id }, data: { dueAt: new Date(Date.now() + 86400_000) } }));
  });

  it('many students submitting at the same time each get exactly one version (E24)', async () => {
    const a = await publishedAssignment(teacher, f, { title: 'Đồng thời' });
    const clients = [s1, s2];
    const c3 = new Client(app); await c3.login('flow', 'HS0003'); clients.push(c3);
    await Promise.all(clients.map(async (c) => {
      const d = (await c.post(`/api/student/assignments/${a.id}/start`)).body;
      await c.put(`/api/student/submissions/${d.submission.id}/draft`, { answers: { [a.questions[0].id]: { selected: [a.questions[0].options[0].id] }, [a.questions[1].id]: { text: 'bài' } }, revision: d.submission.draftRevision });
      await Promise.all([1, 2, 3].map(() => c.post(`/api/student/submissions/${d.submission.id}/submit`, {}, { headers: { 'Idempotency-Key': `same-${d.submission.id}` } })));
    }));
    const counts = await db.system((tx) => tx.submissionVersion.groupBy({ by: ['submissionId'], where: { submission: { assignmentId: a.id } }, _count: true }));
    expect(counts).toHaveLength(3);
    counts.forEach((c) => expect(c._count).toBe(1));
  });

  it('teacher removed from the class loses access immediately (BR-03)', async () => {
    const sub = await db.system((tx) => tx.submission.findFirstOrThrow({ where: { assignmentId: asg.id, studentId: f.studentIds[0] } }));
    expect((await teacher.get(`/api/teacher/submissions/${sub.id}`)).status).toBe(200);
    const teaching = await db.system((tx) => tx.classTeacher.findFirstOrThrow({ where: { teacherId: f.teacherId, classId: f.classId } }));
    expect((await admin.del(`/api/admin/classes/${f.classId}/teachers/${teaching.id}`)).status).toBe(200);
    expect((await teacher.get(`/api/teacher/submissions/${sub.id}`)).status).toBe(404);
    expect((await teacher.get(`/api/teacher/classes/${f.classId}`)).status).toBe(404);
    await db.system((tx) => tx.classTeacher.create({ data: { tenantId: f.id, classId: f.classId, teacherId: f.teacherId, subjectId: f.subjectId } }));
  });

  it('school admin reads submission content only with a reason, and it is audited as sensitive (D7.2, D7.3)', async () => {
    const sub = await db.system((tx) => tx.submission.findFirstOrThrow({ where: { assignmentId: asg.id, studentId: f.studentIds[0] } }));
    expect((await admin.get(`/api/admin/submissions/${sub.id}`)).body.error.code).toBe('REASON_REQUIRED');
    const r = await admin.get(`/api/admin/submissions/${sub.id}?reason=${encodeURIComponent('Phụ huynh khiếu nại điểm')}`);
    expect(r.status).toBe(200);
    const log = await db.system((tx) => tx.auditLog.findFirstOrThrow({ where: { tenantId: f.id, action: 'submission.content.read', resourceId: sub.id } }));
    expect(log.isSensitive).toBe(true);
    expect(log.reason).toBe('Phụ huynh khiếu nại điểm');
    expect((await admin.put(`/api/teacher/grade-details/${uid()}`, { score: 1 })).status).toBe(403);
  });

  it('dashboards and Excel export reflect real data', async () => {
    const td = (await teacher.get('/api/teacher/dashboard')).body;
    expect(td.classes).toBe(1);
    expect(td.students).toBe(3);
    expect(td.assignmentsTotal).toBeGreaterThanOrEqual(2);
    const sd = (await s1.get('/api/student/dashboard')).body;
    expect(sd.total).toBeGreaterThanOrEqual(2);
    const ad = (await admin.get('/api/admin/dashboard')).body;
    expect(ad.students).toBeGreaterThanOrEqual(5);
    const x = await teacher.get(`/api/teacher/assignments/${asg.id}/export.xlsx`);
    expect(x.status).toBe(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
  });
});
