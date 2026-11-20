import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { currentUser } from './context';

export const IS_PUBLIC = 'isPublic';
export const PLATFORM_REALM = 'platformRealm';
export const ROLES = 'roles';
export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';

/** No authentication required (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route belongs to the Platform Admin realm (separate cookies, secret and user table). */
export const PlatformRealm = () => SetMetadata(PLATFORM_REALM, true);
/** Tenant route restricted to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Allowed while the user must still change the temporary password. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export const CurrentUser = createParamDecorator((_d: unknown, _c: ExecutionContext) => currentUser());
