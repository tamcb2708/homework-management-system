import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import type { Tx } from '../prisma/db.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Per-recipient dedupe key builder (unique per tenant). */
  dedupe?: (userId: string) => string;
}

/** Notifications are written in the same transaction as the business change, so rolled-back actions never notify (BR-50). */
@Injectable()
export class NotifyService {
  async send(tx: Tx, tenantId: string, userIds: string[], n: NotifyInput): Promise<number> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return 0;
    const r = await tx.notification.createMany({
      data: unique.map((userId) => ({
        tenantId,
        userId,
        type: n.type,
        title: n.title.slice(0, 200),
        body: n.body?.slice(0, 1000),
        link: n.link,
        dedupeKey: n.dedupe ? n.dedupe(userId) : null,
      })),
      skipDuplicates: true,
    });
    return r.count;
  }
}
