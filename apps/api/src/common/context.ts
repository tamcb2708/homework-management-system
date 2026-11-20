import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@prisma/client';

export interface RequestUser {
  id: string;
  roles: Role[];
  fullName: string;
  sessionId: string;
}

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  tenantId?: string;
  user?: RequestUser;
  platformUserId?: string;
  platformSessionId?: string;
  /** Marks work done by background jobs / seed (audit actor = SYSTEM). */
  system?: boolean;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function ctx(): RequestContext {
  const c = als.getStore();
  if (!c) throw new Error('No request context');
  return c;
}

export function maybeCtx(): RequestContext | undefined {
  return als.getStore();
}

export function currentUser(): RequestUser {
  const u = ctx().user;
  if (!u) throw new Error('No authenticated user in context');
  return u;
}

export function currentTenantId(): string {
  const t = ctx().tenantId;
  if (!t) throw new Error('No tenant in context');
  return t;
}
