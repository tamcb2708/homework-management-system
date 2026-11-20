import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { TenantDirectory } from '../auth/tenant-directory.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { normalizeIdentifier, pageParams } from '../common/util';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { runWithContext, ctx } from '../common/context';

const RESERVED = new Set(['admin', 'api', 'www', 'app', 'platform', 'static', 'assets', 'mail', 'docs', 'status', 'help']);

export interface CreateTenantInput { name: string; slug: string; timezone?: string; maxUsers?: number; maxStorageMb?: number; adminFullName: string; adminEmail: string }

@Injectable()
export class PlatformService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly tenants: TenantDirectory) {}

  async stats() {
    return this.db.system(async (tx) => {
      const [tenants, users, roles, classes, assignments, versions, aiResults] = await Promise.all([
        tx.tenant.findMany({ orderBy: { createdAt: 'asc' } }),
        tx.user.groupBy({ by: ['tenantId'], where: { deletedAt: null }, _count: true }),
        tx.userRole.groupBy({ by: ['tenantId', 'role'], _count: true }),
        tx.class.groupBy({ by: ['tenantId'], where: { archivedAt: null }, _count: true }),
        tx.assignment.groupBy({ by: ['tenantId'], where: { deletedAt: null }, _count: true }),
        tx.submissionVersion.groupBy({ by: ['tenantId'], _count: true }),
        tx.aiGradingResult.groupBy({ by: ['tenantId'], _sum: { costMicros: true } }),
      ]);
      const c = (rows: { tenantId: string; _count: number }[], id: string) => rows.find((r) => r.tenantId === id)?._count ?? 0;
      const perTenant = tenants.map((t) => ({
        id: t.id, slug: t.slug, name: t.name, status: t.status, createdAt: t.createdAt, maxUsers: t.maxUsers,
        users: c(users as any, t.id), teachers: roles.find((r) => r.tenantId === t.id && r.role === 'TEACHER')?._count ?? 0,
        students: roles.find((r) => r.tenantId === t.id && r.role === 'STUDENT')?._count ?? 0,
        classes: c(classes as any, t.id), assignments: c(assignments as any, t.id), submissions: c(versions as any, t.id),
        aiCostMicros: Number(aiResults.find((r) => r.tenantId === t.id)?._sum.costMicros ?? 0),
      }));
      const sum = (k: keyof (typeof perTenant)[number]) => perTenant.reduce((s, t) => s + Number(t[k]), 0);
      return {
        tenants: { total: tenants.length, active: tenants.filter((t) => t.status === 'ACTIVE').length, suspended: tenants.filter((t) => t.status === 'SUSPENDED').length },
        totals: { users: sum('users'), teachers: sum('teachers'), students: sum('students'), classes: sum('classes'), assignments: sum('assignments'), submissions: sum('submissions') },
        perTenant,
      };
    });
  }

  async createTenant(dto: CreateTenantInput) {
    const slug = normalizeIdentifier(dto.slug);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) || RESERVED.has(slug)) throw badRequest('INVALID_SLUG', 'Mã trường chỉ gồm chữ thường, số, gạch ngang (tối đa 40 ký tự) và không thuộc danh sách dành riêng.');
    const temp = generateTemporaryPassword();
    const hash = await hashPassword(temp);
    const r = await this.db.system(async (tx) => {
      if (await tx.tenant.findUnique({ where: { slug } })) throw conflict('SLUG_TAKEN', 'Mã trường đã được sử dụng.');
      const t = await tx.tenant.create({
        data: { slug, name: dto.name.trim(), timezone: dto.timezone ?? 'Asia/Ho_Chi_Minh', maxUsers: dto.maxUsers ?? null, maxStorageBytes: dto.maxStorageMb ? BigInt(dto.maxStorageMb) * 1024n * 1024n : null },
      });
      await tx.tenantSettings.create({ data: { tenantId: t.id } });
      const email = normalizeIdentifier(dto.adminEmail);
      const admin = await tx.user.create({
        data: { tenantId: t.id, username: email, email, fullName: dto.adminFullName.trim(), passwordHash: hash, mustChangePassword: true, roles: { create: { role: 'SCHOOL_ADMIN' } } },
      });
      await this.audit.platform(tx, { action: 'platform.tenant.create', targetTenantId: t.id, resourceType: 'tenant', resourceId: t.id, metadata: { slug } });
      await runWithContext({ ...ctx() }, () => this.audit.log(tx, { action: 'tenant.provisioned', resourceType: 'user', resourceId: admin.id }, t.id));
      return { tenant: t, adminUsername: email };
    });
    return { id: r.tenant.id, slug: r.tenant.slug, name: r.tenant.name, schoolAdmin: { username: r.adminUsername, temporaryPassword: temp } };
  }

  async updateTenant(id: string, dto: { name?: string; maxUsers?: number | null; maxStorageMb?: number | null }) {
    const t = await this.db.system(async (tx) => {
      const t = await tx.tenant.update({
        where: { id },
        data: {
          name: dto.name?.trim(), maxUsers: dto.maxUsers === undefined ? undefined : dto.maxUsers,
          maxStorageBytes: dto.maxStorageMb === undefined ? undefined : dto.maxStorageMb === null ? null : BigInt(dto.maxStorageMb) * 1024n * 1024n,
        },
      });
      await this.audit.platform(tx, { action: 'platform.tenant.update', targetTenantId: id, metadata: { ...dto } });
      return t;
    });
    this.tenants.invalidate();
    return { id: t.id, slug: t.slug, name: t.name, status: t.status };
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.db.system(async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id } });
      if (!t) throw notFound();
      if (t.status === 'ARCHIVED') throw conflict('ARCHIVED', 'Trường đã ngừng sử dụng.');
      await tx.tenant.update({ where: { id }, data: { status, suspendedAt: status === 'SUSPENDED' ? new Date() : null } });
      if (status === 'SUSPENDED') await tx.authSession.updateMany({ where: { tenantId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'tenant_suspended' } });
      await this.audit.platform(tx, { action: status === 'SUSPENDED' ? 'platform.tenant.suspend' : 'platform.tenant.activate', targetTenantId: id });
    });
    this.tenants.invalidate();
    return { ok: true };
  }

  auditLogs(page?: number) {
    const { skip, take, page: p, pageSize } = pageParams(page, 30);
    return this.db.system(async (tx) => {
      const [total, items] = await Promise.all([tx.platformAuditLog.count(), tx.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take })]);
      return { total, page: p, pageSize, items };
    });
  }

  async aiSettings() {
    const s = await this.db.systemClient.platformSetting.findUnique({ where: { key: 'ai.kill_switch' } });
    return { killSwitchEnabled: (s?.value as any)?.enabled === true, provider: process.env.AI_PROVIDER ?? 'disabled' };
  }

  async setKillSwitch(enabled: boolean) {
    await this.db.system(async (tx) => {
      await tx.platformSetting.upsert({ where: { key: 'ai.kill_switch' }, create: { key: 'ai.kill_switch', value: { enabled } }, update: { value: { enabled } } });
      await this.audit.platform(tx, { action: 'platform.ai.kill_switch', metadata: { enabled } });
    });
    return this.aiSettings();
  }
}
