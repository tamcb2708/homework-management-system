import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { loadConfig } from '../config/env';
import { currentTenantId } from '../common/context';

export type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Database access with tenant isolation (docs/architecture.md §3.5).
 *  - tenant(): runs fn in a transaction as role hms_app with app.tenant_id set via set_config(..., is_local=true),
 *    so the setting never leaks to another request sharing the pooled connection. RLS enforces the boundary.
 *  - system(): role hms_system, for platform/scheduler work only (explicit permissive policy). Restricted by convention
 *    to the platform, auth (tenant lookup), scheduler and seed modules.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly app: PrismaClient;
  private readonly sys: PrismaClient;

  constructor() {
    const cfg = loadConfig();
    this.app = new PrismaClient({ datasources: { db: { url: cfg.databaseUrl } } });
    this.sys = new PrismaClient({ datasources: { db: { url: cfg.databaseSystemUrl } } });
  }

  async onModuleInit() {
    await Promise.all([this.app.$connect(), this.sys.$connect()]);
    // Defense in depth: refuse to run if the runtime role could bypass RLS.
    const rows = await this.app.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    if (rows[0]?.rolbypassrls || rows[0]?.rolsuper) {
      throw new Error('DATABASE_URL role must not be superuser or have BYPASSRLS');
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.app.$disconnect(), this.sys.$disconnect()]);
  }

  tenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.withTenant(currentTenantId(), fn);
  }

  withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!tenantId) throw new Error('tenantId is required');
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.sys.$transaction(fn, TX_OPTIONS);
  }

  /** Read-only lookups on platform tables allowed to hms_app (tenants, platform_settings). */
  get appClient(): PrismaClient {
    return this.app;
  }

  get systemClient(): PrismaClient {
    return this.sys;
  }
}
