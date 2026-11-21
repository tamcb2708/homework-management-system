import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import { AppError, conflict, unauthorized } from '../common/errors';
import { ctx } from '../common/context';
import { normalizeIdentifier } from '../common/util';
import { verifyPassword } from './password';
import { csrfTokenFor, newRefreshSecret, PLATFORM_SESSION_HOURS, safeEqualHex, sha256, signPlatformAccess } from './tokens';
import type { IssuedSession } from './auth.service';

/** Platform Admin realm: separate table, secret, cookies (docs/authentication-authorization.md §1). */
@Injectable()
export class PlatformAuthService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  async login(email: string, password: string) {
    const e = normalizeIdentifier(email);
    const u0 = await this.db.systemClient.platformUser.findUnique({ where: { email: e } });
    if (u0?.lockedUntil && u0.lockedUntil > new Date()) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'ACCOUNT_TEMP_LOCKED', 'Tài khoản tạm khóa do đăng nhập sai nhiều lần.');
    }
    const ok = await verifyPassword(u0?.passwordHash, password);
    if (!u0 || !ok) {
      if (u0) {
        // Own transaction: must persist even though we refuse the login.
        await this.db.system(async (tx) => {
          const failed = u0.failedLoginCount + 1;
          await tx.platformUser.update({
            where: { id: u0.id },
            data: { failedLoginCount: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + Math.min(60, 5 * 2 ** (failed - 5)) * 60_000) : null },
          });
          await this.audit.platform(tx, { action: 'platform.auth.login.failed', resourceType: 'platform_user', resourceId: u0.id });
        });
      }
      throw unauthorized('INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng.');
    }
    if (u0.status !== 'ACTIVE') throw unauthorized('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.');
    return this.db.system(async (tx) => {
      const u = u0;
      await tx.platformUser.update({ where: { id: u.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      const issued = await this.issue(tx, u.id, randomUUID());
      await this.audit.platform(tx, { action: 'platform.auth.login.success', resourceType: 'platform_user', resourceId: u.id });
      return { ...issued, profile: { id: u.id, email: u.email, fullName: u.fullName } };
    });
  }

  private async issue(tx: any, userId: string, familyId: string, expiresAt?: Date): Promise<IssuedSession> {
    const cfg = loadConfig();
    const sid = randomUUID();
    const secret = newRefreshSecret();
    await tx.platformSession.create({
      data: {
        id: sid, platformUserId: userId, familyId, refreshTokenHash: sha256(secret),
        expiresAt: expiresAt ?? new Date(Date.now() + PLATFORM_SESSION_HOURS * 3600_000),
        ip: ctx().ip, userAgent: ctx().userAgent?.slice(0, 300),
      },
    });
    return {
      access: await signPlatformAccess(cfg.platformJwtSecret, { sub: userId, sid }),
      refresh: `${sid}.${secret}`,
      csrf: csrfTokenFor(cfg.csrfSecret, `p:${sid}`),
    };
  }

  async refresh(token: string | undefined): Promise<IssuedSession> {
    const [sid, secret] = (token ?? '').split('.');
    if (!sid || !secret || !/^[0-9a-f-]{36}$/i.test(sid)) throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    const r = await this.db.system(async (tx): Promise<{ issued: IssuedSession } | { reuseFamily: string }> => {
      const s = await tx.platformSession.findUnique({ where: { id: sid }, include: { user: true } });
      const now = new Date();
      if (!s || !safeEqualHex(s.refreshTokenHash, sha256(secret)) || s.revokedAt || s.expiresAt < now || s.user.status !== 'ACTIVE') {
        throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
      }
      if (s.replacedAt) {
        if (now.getTime() - s.replacedAt.getTime() < 10_000) throw conflict('REFRESH_RETRY', 'Vui lòng thử lại.');
        return { reuseFamily: s.familyId };
      }
      await tx.platformSession.update({ where: { id: s.id }, data: { replacedAt: now } });
      return { issued: await this.issue(tx, s.platformUserId, s.familyId, s.expiresAt) };
    });
    if ('issued' in r) return r.issued;
    await this.db.system((tx) => tx.platformSession.updateMany({ where: { familyId: r.reuseFamily, revokedAt: null }, data: { revokedAt: new Date() } }));
    throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
  }

  async validate(sub: string, sid: string) {
    const s = await this.db.systemClient.platformSession.findUnique({ where: { id: sid }, include: { user: true } });
    if (!s || s.revokedAt || s.platformUserId !== sub || s.user.status !== 'ACTIVE') throw unauthorized('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    return { id: s.user.id, email: s.user.email, fullName: s.user.fullName };
  }

  async logout() {
    const sid = ctx().platformSessionId;
    if (!sid) return;
    await this.db.system(async (tx) => {
      await tx.platformSession.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.platform(tx, { action: 'platform.auth.logout' });
    });
  }
}
