import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import { AppError, badRequest, conflict, unauthorized } from '../common/errors';
import { ctx, currentUser, RequestUser, runWithContext } from '../common/context';
import { normalizeIdentifier } from '../common/util';
import { assertPasswordPolicy, hashPassword, verifyPassword } from './password';
import {
  csrfTokenFor, newRefreshSecret, REFRESH_ABSOLUTE_DAYS, REFRESH_IDLE_DAYS, safeEqualHex, sha256, signTenantAccess, TenantAccessClaims,
} from './tokens';
import { TenantDirectory } from './tenant-directory.service';

export interface IssuedSession { access: string; refresh: string; csrf: string }
export interface LoginResult extends IssuedSession { profile: Profile }
export interface Profile {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  roles: Role[];
  mustChangePassword: boolean;
  tenant: { id: string; slug: string; name: string };
}

const MAX_FAILED = 5;
const REUSE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly tenants: TenantDirectory) {}

  async login(schoolCode: string, identifier: string, password: string): Promise<LoginResult> {
    const tenant = await this.tenants.requireActiveBySlug(schoolCode);
    const id = normalizeIdentifier(identifier);
    return runWithContext({ ...ctx(), tenantId: tenant.id }, () =>
      this.db.tenant(async (tx) => {
        const user = await tx.user.findFirst({
          where: { deletedAt: null, OR: [{ username: id }, { email: id }] },
          include: { roles: true },
        });
        if (user?.lockedUntil && user.lockedUntil > new Date()) {
          await this.audit.log(tx, { action: 'auth.login.blocked', resourceType: 'user', resourceId: user.id });
          throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'ACCOUNT_TEMP_LOCKED', 'Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.');
        }
        const ok = await verifyPassword(user?.passwordHash, password);
        if (!user || !ok) {
          if (user) {
            const failed = user.failedLoginCount + 1;
            const lockMinutes = failed >= MAX_FAILED ? Math.min(60, 5 * 2 ** (failed - MAX_FAILED)) : 0;
            await tx.user.update({
              where: { id: user.id },
              data: { failedLoginCount: failed, lockedUntil: lockMinutes ? new Date(Date.now() + lockMinutes * 60_000) : null },
            });
            await this.audit.log(tx, { action: 'auth.login.failed', resourceType: 'user', resourceId: user.id });
          }
          throw unauthorized('INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng.');
        }
        if (user.status !== 'ACTIVE') throw unauthorized('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị trường.');
        await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
        const issued = await this.createSession(tx, tenant.id, user.id, user.authzVersion, randomUUID());
        await this.audit.log(tx, { action: 'auth.login.success', resourceType: 'user', resourceId: user.id });
        return {
          ...issued,
          profile: {
            id: user.id, fullName: user.fullName, username: user.username, email: user.email,
            roles: user.roles.map((r) => r.role), mustChangePassword: user.mustChangePassword,
            tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
          },
        };
      }),
    );
  }

  private async createSession(tx: Tx, tenantId: string, userId: string, rv: number, familyId: string, absoluteExpiresAt?: Date) {
    const cfg = loadConfig();
    const sessionId = randomUUID();
    const secret = newRefreshSecret();
    const c = ctx();
    await tx.authSession.create({
      data: {
        id: sessionId, tenantId, userId, familyId,
        refreshTokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + REFRESH_IDLE_DAYS * 86400_000),
        absoluteExpiresAt: absoluteExpiresAt ?? new Date(Date.now() + REFRESH_ABSOLUTE_DAYS * 86400_000),
        ip: c.ip, userAgent: c.userAgent?.slice(0, 300),
      },
    });
    const access = await signTenantAccess(cfg.jwtSecret, { sub: userId, tid: tenantId, sid: sessionId, rv });
    return { access, refresh: `${tenantId}.${sessionId}.${secret}`, csrf: csrfTokenFor(cfg.csrfSecret, sessionId) };
  }

  /** Refresh-token rotation with reuse detection (docs/authentication-authorization.md §4.3). */
  async refresh(token: string | undefined): Promise<IssuedSession> {
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    const [tenantId, sessionId, secret] = parts;
    const tenant = await this.tenants.requireActiveById(tenantId).catch(() => null);
    if (!tenant) throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    return runWithContext({ ...ctx(), tenantId }, () =>
      this.db.tenant(async (tx) => {
        const s = await tx.authSession.findUnique({ where: { id: sessionId } }).catch(() => null);
        if (!s || !safeEqualHex(s.refreshTokenHash, sha256(secret))) throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
        const now = new Date();
        if (s.revokedAt || s.expiresAt < now || s.absoluteExpiresAt < now) throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
        if (s.replacedAt) {
          if (now.getTime() - s.replacedAt.getTime() < REUSE_GRACE_MS) throw conflict('REFRESH_RETRY', 'Phiên vừa được làm mới, vui lòng thử lại.');
          await tx.authSession.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: now, revokeReason: 'refresh_reuse' } });
          await this.audit.log(tx, { action: 'auth.refresh.reuse_detected', resourceType: 'user', resourceId: s.userId });
          throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
        }
        const user = await tx.user.findUnique({ where: { id: s.userId } });
        if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw unauthorized('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.');
        const claimed = await tx.authSession.updateMany({ where: { id: s.id, replacedAt: null }, data: { replacedAt: now } });
        if (claimed.count !== 1) throw conflict('REFRESH_RETRY', 'Phiên vừa được làm mới, vui lòng thử lại.');
        return this.createSession(tx, tenantId, user.id, user.authzVersion, s.familyId, s.absoluteExpiresAt);
      }),
    );
  }

  async logout(all: boolean) {
    const u = currentUser();
    await this.db.tenant(async (tx) => {
      const where = all ? { userId: u.id, revokedAt: null } : { id: u.sessionId, revokedAt: null };
      await tx.authSession.updateMany({ where, data: { revokedAt: new Date(), revokeReason: all ? 'logout_all' : 'logout' } });
      await this.audit.log(tx, { action: all ? 'auth.logout_all' : 'auth.logout', resourceType: 'user', resourceId: u.id });
    });
  }

  /** Called by the auth guard on every tenant request. */
  async loadRequestUser(claims: TenantAccessClaims): Promise<RequestUser & { mustChangePassword: boolean }> {
    return this.db.withTenant(claims.tid, async (tx) => {
      const [user, session] = await Promise.all([
        tx.user.findUnique({ where: { id: claims.sub }, include: { roles: true } }),
        tx.authSession.findUnique({ where: { id: claims.sid }, select: { revokedAt: true, userId: true } }),
      ]);
      if (!user || user.deletedAt || user.status !== 'ACTIVE') throw unauthorized('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.');
      if (!session || session.revokedAt || session.userId !== user.id) throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
      if (user.authzVersion !== claims.rv) throw unauthorized('SESSION_STALE', 'Quyền truy cập đã thay đổi, vui lòng làm mới phiên.');
      return { id: user.id, roles: user.roles.map((r) => r.role), fullName: user.fullName, sessionId: claims.sid, mustChangePassword: user.mustChangePassword };
    });
  }

  async profile(): Promise<Profile> {
    const u = currentUser();
    const tenant = await this.tenants.requireActiveById(ctx().tenantId!);
    return this.db.tenant(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: u.id }, include: { roles: true } });
      return {
        id: user.id, fullName: user.fullName, username: user.username, email: user.email,
        roles: user.roles.map((r) => r.role), mustChangePassword: user.mustChangePassword,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      };
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<IssuedSession> {
    const u = currentUser();
    const tenantId = ctx().tenantId!;
    return this.db.tenant(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: u.id }, include: { student: true } });
      if (!(await verifyPassword(user.passwordHash, currentPassword))) throw badRequest('WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.');
      if (currentPassword === newPassword) throw badRequest('WEAK_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
      assertPasswordPolicy(newPassword, [user.username, user.email, user.student?.studentCode, user.fullName.replace(/\s+/g, '')]);
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date(), authzVersion: { increment: 1 } },
      });
      // Revoke every other session; issue a fresh one for this device.
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'password_changed' } });
      await this.audit.log(tx, { action: 'auth.password.changed', resourceType: 'user', resourceId: user.id });
      return this.createSession(tx, tenantId, user.id, updated.authzVersion, randomUUID());
    });
  }
}
