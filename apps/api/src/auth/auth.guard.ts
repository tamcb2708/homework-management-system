import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, PLATFORM_REALM, ROLES } from '../common/decorators';
import { ctx } from '../common/context';
import { forbidden, unauthorized } from '../common/errors';
import { loadConfig } from '../config/env';
import { AuthService } from './auth.service';
import { PlatformAuthService } from './platform-auth.service';
import { TenantDirectory } from './tenant-directory.service';
import { COOKIES } from './cookies';
import { csrfMatches, verifyPlatformAccess, verifyTenantAccess } from './tokens';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global guard implementing layers 2–6 of docs/authentication-authorization.md §7:
 * origin check → realm token → tenant ACTIVE + claim → user/session state → pending password → roles → CSRF.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthService,
    private readonly tenants: TenantDirectory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
    const cfg = loadConfig();
    const unsafe = UNSAFE.has(req.method);

    // Origin check for every state-changing request (browsers always send Origin on POST/PUT/PATCH/DELETE).
    if (unsafe) {
      const origin = req.headers.origin;
      if (origin && !cfg.appOrigins.includes(origin)) throw forbidden('BAD_ORIGIN', 'Nguồn yêu cầu không hợp lệ.');
    }
    if (meta<boolean>(IS_PUBLIC)) return true;

    if (meta<boolean>(PLATFORM_REALM)) {
      const token = req.cookies?.[COOKIES.pAccess()];
      const claims = token ? await verifyPlatformAccess(cfg.platformJwtSecret, token) : null;
      if (!claims) throw unauthorized();
      await this.platform.validate(claims.sub, claims.sid);
      ctx().platformUserId = claims.sub;
      ctx().platformSessionId = claims.sid;
      if (unsafe && !csrfMatches(cfg.csrfSecret, `p:${claims.sid}`, req.headers['x-csrf-token'] as string)) {
        throw forbidden('CSRF_FAILED', 'Phiên làm việc không hợp lệ, vui lòng tải lại trang.');
      }
      return true;
    }

    // Tenant realm: cookie first; Bearer only when explicitly enabled (D2.3).
    const cookieToken = req.cookies?.[COOKIES.access()];
    const authz = req.headers.authorization;
    const bearer = cfg.bearerEnabled && authz?.startsWith('Bearer ') ? authz.slice(7) : undefined;
    if (cookieToken && bearer) throw unauthorized('AMBIGUOUS_CREDENTIALS', 'Yêu cầu chứa nhiều loại thông tin xác thực.');
    const token = cookieToken ?? bearer;
    const claims = token ? await verifyTenantAccess(cfg.jwtSecret, token) : null;
    if (!claims) throw unauthorized();
    await this.tenants.requireActiveById(claims.tid);
    const user = await this.auth.loadRequestUser(claims);
    ctx().tenantId = claims.tid;
    ctx().user = { id: user.id, roles: user.roles, fullName: user.fullName, sessionId: user.sessionId };

    if (unsafe && cookieToken && !csrfMatches(cfg.csrfSecret, claims.sid, req.headers['x-csrf-token'] as string)) {
      throw forbidden('CSRF_FAILED', 'Phiên làm việc không hợp lệ, vui lòng tải lại trang.');
    }
    if (user.mustChangePassword && !meta<boolean>(ALLOW_PENDING_PASSWORD)) {
      throw forbidden('PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục.');
    }
    const roles = meta<Role[]>(ROLES);
    if (roles?.length && !roles.some((r) => user.roles.includes(r))) throw forbidden();
    return true;
  }
}
