import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../prisma/db.service';
import { NotifyService } from '../notifications/notify.service';
import { ScopeService } from '../academics/scope.service';
import { StudentService } from '../submissions/student.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import { runWithContext } from '../common/context';

/**
 * In-process scheduler (replaces BullMQ for the MVP – see IMPLEMENTATION-ROADMAP §3).
 * Discovery uses hms_system; every mutation runs per tenant as hms_app with tenant context (architecture §3.9).
 * Safe with several instances: conditional updates, dedupe keys and idempotency keys make each step idempotent.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Scheduler');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DbService,
    private readonly notify: NotifyService,
    private readonly scope: ScopeService,
    private readonly students: StudentService,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (!loadConfig().schedulerEnabled) return;
    this.timer = setInterval(() => void this.tick(), 30_000);
    setTimeout(() => void this.tick(), 3_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private inTenant<T>(tenantId: string, fn: () => Promise<T>) {
    return runWithContext({ requestId: `scheduler-${randomUUID()}`, tenantId, system: true }, fn);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.publishScheduled();
      await this.dueReminders();
      await this.autoSubmit();
    } catch (e: any) {
      this.log.error(`tick failed: ${e?.message}`);
    } finally {
      this.running = false;
    }
  }

  async publishScheduled(now = new Date()) {
    const due = await this.db.systemClient.assignment.findMany({
      where: { status: 'SCHEDULED', openAt: { lte: now }, deletedAt: null, tenant: { status: 'ACTIVE' } }, select: { id: true, tenantId: true, title: true }, take: 200,
    });
    for (const a of due) {
      await this.inTenant(a.tenantId, () => this.db.tenant(async (tx) => {
        const r = await tx.assignment.updateMany({ where: { id: a.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHED', publishedAt: now } });
        if (!r.count) return;
        const recipients = await this.scope.recipients(tx, a.id);
        await this.notify.send(tx, a.tenantId, recipients, { type: 'ASSIGNMENT_PUBLISHED', title: `Bài tập mới: ${a.title}`, link: `/student/assignments/${a.id}`, dedupe: (u) => `asg-pub:${a.id}:${u}` });
        await this.audit.log(tx, { action: 'assignment.auto_publish', resourceType: 'assignment', resourceId: a.id });
      }));
    }
    return due.length;
  }

  async dueReminders(now = new Date()) {
    const soon = await this.db.systemClient.assignment.findMany({
      where: { status: 'PUBLISHED', dueReminderSentAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600_000) }, deletedAt: null, tenant: { status: 'ACTIVE' } },
      select: { id: true, tenantId: true, title: true, dueAt: true }, take: 200,
    });
    for (const a of soon) {
      await this.inTenant(a.tenantId, () => this.db.tenant(async (tx) => {
        const r = await tx.assignment.updateMany({ where: { id: a.id, dueReminderSentAt: null }, data: { dueReminderSentAt: now } });
        if (!r.count) return;
        const recipients = await this.scope.recipients(tx, a.id);
        const done = await tx.submission.findMany({ where: { assignmentId: a.id, latestVersionId: { not: null } }, select: { studentId: true } });
        const pending = recipients.filter((s) => !done.some((d) => d.studentId === s));
        await this.notify.send(tx, a.tenantId, pending, {
          type: 'ASSIGNMENT_DUE_SOON', title: `Sắp đến hạn: ${a.title}`, link: `/student/assignments/${a.id}`, dedupe: (u) => `due:${a.id}:${a.dueAt!.getTime()}:${u}`,
        });
      }));
    }
    return soon.length;
  }

  async autoSubmit(now = new Date()) {
    const expired = await this.db.systemClient.submission.findMany({
      where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date(now.getTime() - 30_000) }, tenant: { status: 'ACTIVE' } },
      select: { id: true, tenantId: true, startedAt: true }, take: 200,
    });
    let n = 0;
    for (const s of expired) {
      try {
        await this.inTenant(s.tenantId, () => this.db.tenant((tx) => this.students.doSubmit(tx, s.id, { key: `auto-${s.id}-${s.startedAt.getTime()}`, auto: true })));
        n++;
      } catch (e: any) {
        this.log.warn(`auto-submit ${s.id} skipped: ${e?.message}`);
      }
    }
    return n;
  }
}
