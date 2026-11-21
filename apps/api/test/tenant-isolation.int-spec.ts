import type { INestApplication } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Client, createApp, createTenant, publishedAssignment, TenantFixture } from './helpers';
import type { DbService } from '../src/prisma/db.service';

describe('Multi-tenant isolation (D3, flow 20)', () => {
  let app: INestApplication; let db: DbService; let A: TenantFixture; let B: TenantFixture;
  let assignmentB: string;
  beforeAll(async () => {
    ({ app, db } = await createApp());
    A = await createTenant(db, 'iso-a');
    B = await createTenant(db, 'iso-b'); // same student codes HS0001.. and class codes on purpose
    const tb = new Client(app);
    await tb.login('iso-b', 'teacher@iso-b.test');
    assignmentB = (await publishedAssignment(tb, B)).id;
  });
  afterAll(() => app.close());

  it('same student code in two schools logs into the right tenant (D4.2)', async () => {
    const a = new Client(app); await a.login('iso-a', 'HS0001');
    const b = new Client(app); await b.login('iso-b', 'HS0001');
    expect((await a.get('/api/auth/me')).body.tenant.slug).toBe('iso-a');
    expect((await b.get('/api/auth/me')).body.tenant.slug).toBe('iso-b');
    expect((await a.get('/api/student/assignments')).body).toHaveLength(0);
    expect((await b.get('/api/student/assignments')).body).toHaveLength(1);
  });

  it('API: ids from another tenant are invisible (404) for every role', async () => {
    const teacherA = new Client(app); await teacherA.login('iso-a', 'teacher@iso-a.test');
    expect((await teacherA.get(`/api/teacher/assignments/${assignmentB}`)).status).toBe(404);
    expect((await teacherA.get(`/api/teacher/assignments/${assignmentB}/roster`)).status).toBe(404);
    const studentA = new Client(app); await studentA.login('iso-a', 'HS0001');
    expect((await studentA.get(`/api/student/assignments/${assignmentB}`)).status).toBe(404);
    expect((await studentA.post(`/api/student/assignments/${assignmentB}/start`)).status).toBe(404);
    const adminA = new Client(app); await adminA.login('iso-a', 'admin@iso-a.test');
    expect((await adminA.get(`/api/admin/classes/${B.classId}`)).status).toBe(404);
    // Cross-tenant link attempt: enrol tenant B's student into tenant A's class
    const r = await adminA.post(`/api/admin/classes/${A.classId}/students`, { studentIds: [B.studentIds[0]] });
    expect(r.status).toBe(404);
    const enrolled = await db.system((tx) => tx.classStudent.count({ where: { classId: A.classId, studentId: B.studentIds[0] } }));
    expect(enrolled).toBe(0);
    // Teacher A publishing to tenant B's class
    const a = (await teacherA.post('/api/teacher/assignments', { title: 'Bài chéo', subjectId: A.subjectId })).body;
    await teacherA.post(`/api/teacher/assignments/${a.id}/questions`, { type: 'TRUE_FALSE', content: 'x', points: 1, options: [{ content: 'Đúng', isCorrect: true }, { content: 'Sai', isCorrect: false }] });
    const p = await teacherA.post(`/api/teacher/assignments/${a.id}/publish`, { classIds: [B.classId], studentIds: [], dueAt: new Date(Date.now() + 86400_000).toISOString() });
    expect(p.status).toBe(422);
  });

  it('DB: hms_app sees nothing without tenant context, only its tenant with context, and cannot write cross-tenant (RLS)', async () => {
    const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      expect(await appDb.subject.count()).toBe(0);
      const seen = await appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${A.id}, true)`;
        return tx.subject.findMany({ select: { tenantId: true } });
      });
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((s) => s.tenantId === A.id)).toBe(true);
      await expect(appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${A.id}, true)`;
        await tx.subject.create({ data: { tenantId: B.id, code: 'EVIL', name: 'evil' } });
      })).rejects.toThrow(/row-level security/);
      await expect(appDb.platformUser.count()).rejects.toThrow(/permission denied/);
    } finally {
      await appDb.$disconnect();
    }
  });

  it('DB: composite foreign keys reject cross-tenant links even for the system role', async () => {
    await expect(db.system((tx) => tx.classStudent.create({ data: { tenantId: A.id, classId: A.classId, studentId: B.studentIds[0] } })))
      .rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('concurrent requests of two tenants never see each other (context bound to transaction)', async () => {
    const a = new Client(app); await a.login('iso-a', 'admin@iso-a.test');
    const b = new Client(app); await b.login('iso-b', 'admin@iso-b.test');
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).get('/api/admin/classes')));
    results.forEach((r, i) => {
      const expected = i % 2 ? A.classId : B.classId;
      expect(r.body.some((c: any) => c.id === expected)).toBe(true);
      expect(r.body.some((c: any) => c.id === (i % 2 ? B.classId : A.classId))).toBe(false);
    });
  });

  it('suspended tenant: login and existing sessions are refused', async () => {
    const s = new Client(app); await s.login('iso-b', 'HS0002');
    const p = new Client(app);
    await db.system(async (tx) => tx.platformUser.upsert({ where: { email: 'iso@platform.test' }, create: { email: 'iso@platform.test', fullName: 'x', passwordHash: (await tx.user.findFirstOrThrow({ where: { tenantId: B.id } })).passwordHash }, update: {} }));
    await p.post('/api/platform/auth/login', { email: 'iso@platform.test', password: 'Test-Passw0rd-xyz' });
    expect((await p.post(`/api/platform/tenants/${B.id}/suspend`)).status).toBe(200);
    expect((await s.get('/api/auth/me')).status).toBeGreaterThanOrEqual(401);
    expect((await new Client(app).post('/api/auth/login', { schoolCode: 'iso-b', identifier: 'HS0002', password: 'Test-Passw0rd-xyz' })).body.error.code).toBe('TENANT_SUSPENDED');
    await p.post(`/api/platform/tenants/${B.id}/activate`);
  });
});
