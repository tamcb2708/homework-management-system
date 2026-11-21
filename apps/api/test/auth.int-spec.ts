import type { INestApplication } from '@nestjs/common';
import { Client, createApp, createTenant, PASSWORD, TenantFixture } from './helpers';
import type { DbService } from '../src/prisma/db.service';
import { hashPassword } from '../src/auth/password';

describe('Authentication (flows 1, 5, 8 + security)', () => {
  let app: INestApplication; let db: DbService; let f: TenantFixture;
  beforeAll(async () => {
    ({ app, db } = await createApp());
    f = await createTenant(db, 'auth-a');
    await db.system(async (tx) => {
      await tx.platformUser.create({ data: { email: 'ops@platform.test', fullName: 'Ops', passwordHash: await hashPassword(PASSWORD) } });
    });
  });
  afterAll(() => app.close());

  it('student logs in with student code (D4.1), cookies are httpOnly, no token in body', async () => {
    const c = new Client(app);
    const res = await c.login('auth-a', 'HS0001');
    expect(res.body.user.roles).toEqual(['STUDENT']);
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // no JWT in body
    const set = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(set).toMatch(/hms_at=[^;]+;.*HttpOnly/);
    expect(set).toMatch(/hms_rt=[^;]+;.*HttpOnly.*SameSite=Strict/);
    expect((await c.get('/api/auth/me')).body.username).toBe('hs0001');
  });

  it('admin and teacher log in by email; wrong school code / password give generic errors', async () => {
    await new Client(app).login('auth-a', `admin@auth-a.test`);
    await new Client(app).login('auth-a', `teacher@auth-a.test`);
    const bad = await new Client(app).post('/api/auth/login', { schoolCode: 'auth-a', identifier: 'HS0001', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    const ghost = await new Client(app).post('/api/auth/login', { schoolCode: 'auth-a', identifier: 'nobody', password: 'wrong-password' });
    expect(ghost.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await new Client(app).post('/api/auth/login', { schoolCode: 'no-such', identifier: 'x', password: 'y' })).status).toBe(404);
  });

  it('locks the account temporarily after 5 failures (AUTH-08) and records audit', async () => {
    const c = new Client(app);
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { schoolCode: 'auth-a', identifier: 'HS0003', password: 'bad-bad-bad' });
    const r = await c.post('/api/auth/login', { schoolCode: 'auth-a', identifier: 'HS0003', password: PASSWORD });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('ACCOUNT_TEMP_LOCKED');
    const fails = await db.system((tx) => tx.auditLog.count({ where: { tenantId: f.id, action: 'auth.login.failed', resourceId: f.studentIds[2] } }));
    expect(fails).toBe(5);
  });

  it('rejects state-changing requests without CSRF token or from a foreign origin', async () => {
    const c = new Client(app);
    await c.login('auth-a', 'HS0002');
    expect((await c.post('/api/notifications/read-all', {}, { csrf: false })).status).toBe(403);
    expect((await c.post('/api/notifications/read-all', {}, { headers: { Origin: 'https://evil.example' } })).body.error.code).toBe('BAD_ORIGIN');
    expect((await c.post('/api/notifications/read-all')).status).toBe(200);
  });

  it('refresh rotates the token and detects reuse of an old refresh token', async () => {
    const c = new Client(app);
    await c.login('auth-a', `teacher2@auth-a.test`);
    const oldRt = c.cookies.get('hms_rt')!;
    expect((await c.post('/api/auth/refresh')).status).toBe(200);
    expect(c.cookies.get('hms_rt')).not.toBe(oldRt);
    // replay old token after grace window → whole family revoked
    await db.system((tx) => tx.authSession.updateMany({ where: { userId: f.teacher2Id, replacedAt: { not: null } }, data: { replacedAt: new Date(Date.now() - 60_000) } }));
    const thief = new Client(app);
    thief.cookies.set('hms_rt', oldRt);
    expect((await thief.post('/api/auth/refresh')).status).toBe(401);
    expect((await c.get('/api/auth/me')).status).toBe(401); // legit session revoked too
  });

  it('forces password change for temporary passwords and enforces policy', async () => {
    await db.system((tx) => tx.user.update({ where: { id: f.studentIds[1] }, data: { mustChangePassword: true } }));
    const c = new Client(app);
    await c.login('auth-a', 'HS0002');
    expect((await c.get('/api/student/assignments')).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await c.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'hs0002abc' })).body.error.code).toBe('WEAK_PASSWORD');
    expect((await c.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Mat-khau-moi-2026' })).status).toBe(200);
    expect((await c.get('/api/student/assignments')).status).toBe(200);
    await db.system(async (tx) => tx.user.update({ where: { id: f.studentIds[1] }, data: { passwordHash: await hashPassword(PASSWORD) } }));
  });

  it('logout revokes the session immediately', async () => {
    const c = new Client(app);
    await c.login('auth-a', 'HS0001');
    const at = c.cookies.get('hms_at')!;
    await c.post('/api/auth/logout');
    const replay = new Client(app);
    replay.cookies.set('hms_at', at);
    expect((await replay.get('/api/auth/me')).status).toBe(401);
  });

  it('locking an account revokes access (BR: authz_version + sessions)', async () => {
    const student = new Client(app);
    await student.login('auth-a', 'HS0001');
    const admin = new Client(app);
    await admin.login('auth-a', `admin@auth-a.test`);
    expect((await admin.post(`/api/admin/users/${f.studentIds[0]}/lock`)).status).toBe(200);
    expect((await student.get('/api/auth/me')).status).toBe(401);
    expect((await new Client(app).post('/api/auth/login', { schoolCode: 'auth-a', identifier: 'HS0001', password: PASSWORD })).body.error.code).toBe('ACCOUNT_LOCKED');
    await admin.post(`/api/admin/users/${f.studentIds[0]}/unlock`);
  });

  it('platform realm is separate: platform admin logs in; tenant cookies are rejected there and vice versa', async () => {
    const p = new Client(app);
    const r = await p.post('/api/platform/auth/login', { email: 'ops@platform.test', password: PASSWORD });
    expect(r.status).toBe(200);
    expect((await p.get('/api/platform/stats')).status).toBe(200);
    expect((await p.get('/api/admin/dashboard')).status).toBe(401);
    const t = new Client(app);
    await t.login('auth-a', `admin@auth-a.test`);
    expect((await t.get('/api/platform/stats')).status).toBe(401);
  });
});
