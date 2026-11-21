import type { INestApplication } from '@nestjs/common';
import { Client, createApp, createTenant, inDays, TenantFixture, uid } from './helpers';
import type { DbService } from '../src/prisma/db.service';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('Files (secure upload) and AI gates (D11)', () => {
  let app: INestApplication; let db: DbService; let f: TenantFixture;
  let teacher: Client, s1: Client, s2: Client;
  beforeAll(async () => {
    ({ app, db } = await createApp());
    f = await createTenant(db, 'files');
    teacher = new Client(app); await teacher.login('files', 'teacher@files.test');
    s1 = new Client(app); await s1.login('files', 'HS0001');
    s2 = new Client(app); await s2.login('files', 'HS0002');
  });
  afterAll(() => app.close());

  it('rejects invalid uploads: disguised content, disallowed extension, wrong purpose for role', async () => {
    const fake = await s1.upload('/api/files', { purpose: 'ANSWER_UPLOAD' }, { name: 'bai.pdf', content: Buffer.from('MZ\x90 not a pdf') });
    expect(fake.body.error.code).toBe('FILE_CONTENT_MISMATCH');
    const exe = await s1.upload('/api/files', { purpose: 'ANSWER_UPLOAD' }, { name: 'virus.exe', content: Buffer.from('MZ') });
    expect(exe.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    const role = await s1.upload('/api/files', { purpose: 'ASSIGNMENT_ATTACHMENT' }, { name: 'a.pdf', content: PDF });
    expect(role.body.error.code).toBe('INVALID_PURPOSE');
    await db.system((tx) => tx.tenantSettings.update({ where: { tenantId: f.id }, data: { fileMaxBytes: 10 } }));
    const big = await s1.upload('/api/files', { purpose: 'ANSWER_UPLOAD' }, { name: 'big.pdf', content: PDF });
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
    await db.system((tx) => tx.tenantSettings.update({ where: { tenantId: f.id }, data: { fileMaxBytes: 20 * 1024 * 1024 } }));
    expect(await db.system((tx) => tx.fileObject.count({ where: { tenantId: f.id } }))).toBe(0);
  });

  it('file answers: upload, submit, teacher downloads; other students cannot', async () => {
    const a = (await teacher.post('/api/teacher/assignments', { title: 'Nộp file', subjectId: f.subjectId })).body;
    const full = (await teacher.post(`/api/teacher/assignments/${a.id}/questions`, { type: 'FILE_UPLOAD', content: 'Nộp bài', points: 5, config: { maxFiles: 1 } })).body;
    await teacher.post(`/api/teacher/assignments/${a.id}/publish`, { classIds: [f.classId], studentIds: [], dueAt: inDays(1) });
    const up = await s1.upload('/api/files', { purpose: 'ANSWER_UPLOAD' }, { name: 'Bài làm của em.pdf', content: PDF });
    expect(up.status).toBe(201);
    const stored = await db.system((tx) => tx.fileObject.findUniqueOrThrow({ where: { id: up.body.id } }));
    expect(stored.storageKey.startsWith(`t/${f.id}/`)).toBe(true);
    expect(stored.storageKey).not.toContain('Bài');
    const d = (await s1.post(`/api/student/assignments/${a.id}/start`)).body;
    const qid = full.questions[0].id;
    // someone else's file id is rejected
    const other = await s2.upload('/api/files', { purpose: 'ANSWER_UPLOAD' }, { name: 'x.pdf', content: PDF });
    expect((await s1.put(`/api/student/submissions/${d.submission.id}/draft`, { answers: { [qid]: { fileIds: [other.body.id] } }, revision: d.submission.draftRevision })).body.error.code).toBe('INVALID_FILE');
    expect((await s1.put(`/api/student/submissions/${d.submission.id}/draft`, { answers: { [qid]: { fileIds: [up.body.id] } }, revision: d.submission.draftRevision })).status).toBe(200);
    expect((await s1.post(`/api/student/submissions/${d.submission.id}/submit`, {}, { headers: { 'Idempotency-Key': uid() } })).status).toBe(200);
    const dl = await teacher.get(`/api/files/${up.body.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect((await s2.get(`/api/files/${up.body.id}/download`)).status).toBe(404);
    expect((await s1.get(`/api/files/${up.body.id}/download`)).status).toBe(200);
  });

  it('AI grading stays disabled: gates closed, request refused with 409, nothing queued (D9, D11)', async () => {
    const st = (await teacher.get('/api/ai/status')).body;
    expect(st.enabled).toBe(false);
    expect(st.gates.find((g: any) => g.code === 'G0').open).toBe(false);
    const a = (await teacher.post('/api/teacher/assignments', { title: 'Bài có AI', subjectId: f.subjectId, aiGradingAllowed: true })).body;
    const r = await teacher.post(`/api/ai/assignments/${a.id}/requests`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('AI_GATE_CLOSED');
    expect(await db.system((tx) => tx.aiGradingJob.count())).toBe(0);
    expect(await db.system((tx) => tx.aiGradingRequest.count())).toBe(0);
    const admin = new Client(app); await admin.login('files', 'admin@files.test');
    const en = await admin.patch('/api/admin/settings', { aiEnabled: true, aiApprovalRef: 'QĐ-01' });
    expect(en.body.error.code).toBe('AI_PLATFORM_DISABLED');
  });
});
