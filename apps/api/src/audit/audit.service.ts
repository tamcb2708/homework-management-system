import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { maybeCtx } from '../common/context';
import type { Tx } from '../prisma/db.service';

export interface AuditEntry {
  action: string;
  resourceType?: string;
  resourceId?: string;
  isSensitive?: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** Append-only audit trail (D7.3). Must be called inside the same transaction as the audited change/read. */
@Injectable()
export class AuditService {
  async log(tx: Tx, e: AuditEntry, tenantIdOverride?: string) {
    const c = maybeCtx();
    const tenantId = tenantIdOverride ?? c?.tenantId;
    if (!tenantId) throw new Error('audit without tenant');
    await tx.auditLog.create({
      data: {
        tenantId,
        actorType: c?.user ? 'USER' : c?.platformUserId ? 'PLATFORM' : 'SYSTEM',
        actorUserId: c?.user?.id,
        actorPlatformUserId: c?.platformUserId,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        isSensitive: e.isSensitive ?? false,
        reason: e.reason,
        metadata: (e.metadata as Prisma.InputJsonValue) ?? undefined,
        ip: c?.ip,
        userAgent: c?.userAgent?.slice(0, 300),
        requestId: c?.requestId,
      },
    });
  }

  async platform(tx: Tx, e: AuditEntry & { targetTenantId?: string }) {
    const c = maybeCtx();
    await tx.platformAuditLog.create({
      data: {
        actorPlatformUserId: c?.platformUserId,
        action: e.action,
        targetTenantId: e.targetTenantId,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        metadata: (e.metadata as Prisma.InputJsonValue) ?? undefined,
        ip: c?.ip,
        requestId: c?.requestId,
      },
    });
  }
}
