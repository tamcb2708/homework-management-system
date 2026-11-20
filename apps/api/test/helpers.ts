import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DbService } from '../src/prisma/db.service';
import { hashPassword } from '../src/auth/password';
import type { Role } from '@prisma/client';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'Test-Passw0rd-xyz';

export async function createApp(): Promise<{ app: INestApplication; db: DbService }> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, db: app.get(DbService) };
}

/** HTTP client with a cookie jar, Origin header and automatic X-CSRF-Token (like the browser app). */
export class Client {
  cookies = new Map<string, string>();
  constructor(private readonly app: INestApplication) {}

  private absorb(res: request.Response) {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of set ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (!value || /Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    return res;
  }

  private header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  csrf(): string | undefined {
    return this.cookies.get('hms_csrf') ?? this.cookies.get('hmsp_csrf');
  }

  async req(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown, opts: { csrf?: boolean; headers?: Record<string, string> } = {}) {
    let r = request(this.app.getHttpServer())[method](url).set('Origin', ORIGIN);
    if (this.cookies.size) r = r.set('Cookie', this.header());
    if (opts.csrf !== false && this.csrf()) r = r.set('X-CSRF-Token', this.csrf()!);
    for (const [k, v] of Object.entries(opts.headers ?? {})) r = r.set(k, v);
    const res = body !== undefined && method !== 'get' ? await r.send(body as any) : await r;
    return this.absorb(res);
  }

  get(url: string) { return this.req('get', url); }
  post(url: string, body: unknown = {}, opts?: { csrf?: boolean; headers?: Record<string, string> }) { return this.req('post', url, body, opts); }
  put(url: string, body: unknown = {}) { return this.req('put', url, body); }
  patch(url: string, body: unknown = {}) { return this.req('patch', url, body); }
  del(url: string) { return this.req('delete', url); }

  async upload(url: string, fields: Record<string, string>, file: { name: string; content: Buffer }) {
    let r = request(this.app.getHttpServer()).post(url).set('Origin', ORIGIN).set('Cookie', this.header()).set('X-CSRF-Token', this.csrf() ?? '');
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return this.absorb(await r.attach('file', file.content, file.name));
  }

  async login(school: string, identifier: string, password = PASSWORD) {
    const res = await this.post('/api/auth/login', { schoolCode: school, identifier, password });
    if (res.status !== 200) throw new Error(`login ${identifier} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  }
}

export interface TenantFixture {
  id: string; slug: string;
  adminId: string; teacherId: string; teacher2Id: string; studentIds: string[]; outsiderId: string;
  subjectId: string; classId: string; otherClassId: string; yearId: string;
}

/**
 * Creates a tenant with: 1 admin, 2 teachers (teacher teaches class+subject), 3 students in class,
 * 1 student in another class (outsider). All passwords = PASSWORD, no forced change.
 */
export async function createTenant(db: DbService, slug: string): Promise<TenantFixture> {
  const hash = await hashPassword(PASSWORD);
  return db.system(async (tx) => {
    const t = await tx.tenant.create({ data: { slug, name: `Trường ${slug}` } });
    await tx.tenantSettings.create({ data: { tenantId: t.id } });
    const mk = async (username: string, role: Role, extra: any = {}) => {
      const u = await tx.user.create({
        data: { tenantId: t.id, username, email: username.includes('@') ? username : null, fullName: `Người dùng ${username}`, passwordHash: hash, mustChangePassword: false, roles: { create: { role } }, ...extra },
      });
      return u.id;
    };
    const adminId = await mk(`admin@${slug}.test`, 'SCHOOL_ADMIN');
    const teacherId = await mk(`teacher@${slug}.test`, 'TEACHER', { teacher: { create: {} } });
    const teacher2Id = await mk(`teacher2@${slug}.test`, 'TEACHER', { teacher: { create: {} } });
    const studentIds: string[] = [];
    for (let i = 1; i <= 3; i++) studentIds.push(await mk(`hs000${i}`, 'STUDENT', { student: { create: { studentCode: `HS000${i}` } } }));
    const outsiderId = await mk('hs0099', 'STUDENT', { student: { create: { studentCode: 'HS0099' } } });
    const year = await tx.schoolYear.create({ data: { tenantId: t.id, name: '2026-2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-05-31'), isCurrent: true } });
    const subject = await tx.subject.create({ data: { tenantId: t.id, code: 'TOAN', name: 'Toán' } });
    const cls = await tx.class.create({ data: { tenantId: t.id, schoolYearId: year.id, code: '8A1', name: 'Lớp 8A1' } });
    const other = await tx.class.create({ data: { tenantId: t.id, schoolYearId: year.id, code: '8A9', name: 'Lớp 8A9' } });
    for (const s of studentIds) await tx.classStudent.create({ data: { tenantId: t.id, classId: cls.id, studentId: s } });
    await tx.classStudent.create({ data: { tenantId: t.id, classId: other.id, studentId: outsiderId } });
    await tx.classTeacher.create({ data: { tenantId: t.id, classId: cls.id, teacherId, subjectId: subject.id } });
    return { id: t.id, slug, adminId, teacherId, teacher2Id, studentIds, outsiderId, subjectId: subject.id, classId: cls.id, otherClassId: other.id, yearId: year.id };
  });
}

export const uid = () => randomUUID();
export const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

/** Teacher creates and publishes an assignment (SC 2pts + essay 8pts with rubric) to the fixture class. */
export async function publishedAssignment(teacher: Client, f: TenantFixture, extra: Record<string, unknown> = {}) {
  const a = (await teacher.post('/api/teacher/assignments', { title: 'Bài kiểm tra số 1', subjectId: f.subjectId, passScore: 5, ...extra })).body;
  await teacher.post(`/api/teacher/assignments/${a.id}/questions`, {
    type: 'SINGLE_CHOICE', content: '1 + 1 = ?', points: 2, options: [{ content: '2', isCorrect: true }, { content: '3', isCorrect: false }],
  });
  await teacher.post(`/api/teacher/assignments/${a.id}/questions`, {
    type: 'ESSAY', content: 'Trình bày cách cộng phân số.', points: 8,
    rubric: { criteria: [{ name: 'Nội dung', maxPoints: 5 }, { name: 'Trình bày', maxPoints: 3 }] },
  });
  const pub = await teacher.post(`/api/teacher/assignments/${a.id}/publish`, { classIds: [f.classId], studentIds: [], dueAt: inDays(2) });
  if (pub.status !== 200) throw new Error(`publish failed ${JSON.stringify(pub.body)}`);
  return pub.body as { id: string; questions: { id: string; options: { id: string; isCorrect: boolean }[]; rubric: any }[] };
}
