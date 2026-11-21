import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../academics/scope.service';
import { AiGateService } from '../ai-grading/ai-gate.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { currentTenantId } from '../common/context';
import { dec, num, pageParams } from '../common/util';
import { phaseOf } from '../assignments/phase';
import { fileView } from '../assignments/assignments.service';

const FILE_CEILING = ['pdf', 'docx', 'xlsx', 'pptx', 'jpg', 'png', 'txt'];

export interface SettingsInput {
  fileAllowedTypes?: string[]; fileMaxMb?: number; submitGraceSeconds?: number; scoreStep?: number;
  aiEnabled?: boolean; aiApprovalRef?: string | null; aiApprovedByName?: string | null; aiMonthlyLimitUsd?: number | null;
}

@Injectable()
export class SchoolService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly scope: ScopeService, private readonly ai: AiGateService) {}

  dashboard() {
    return this.db.tenant(async (tx) => {
      const [teachers, students, classes, subjects, assignments, versions, recent] = await Promise.all([
        tx.userRole.count({ where: { role: 'TEACHER', user: { deletedAt: null } } }),
        tx.userRole.count({ where: { role: 'STUDENT', user: { deletedAt: null } } }),
        tx.class.count({ where: { archivedAt: null } }),
        tx.subject.count({ where: { archivedAt: null } }),
        tx.assignment.findMany({ where: { deletedAt: null }, select: { id: true, status: true, submissions: { select: { latestVersionId: true } } } }),
        tx.submissionVersion.count(),
        tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
      ]);
      let targeted = 0, submitted = 0;
      for (const a of assignments.filter((x) => x.status === 'PUBLISHED' || x.status === 'ARCHIVED')) {
        targeted += (await this.scope.recipients(tx, a.id)).length;
        submitted += a.submissions.filter((s) => s.latestVersionId).length;
      }
      const actors = await tx.user.findMany({ where: { id: { in: recent.map((r) => r.actorUserId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } });
      const by = (s: string) => assignments.filter((a) => a.status === s).length;
      return {
        teachers, students, classes, subjects, assignments: assignments.length,
        assignmentsByStatus: { DRAFT: by('DRAFT'), SCHEDULED: by('SCHEDULED'), PUBLISHED: by('PUBLISHED'), REVOKED: by('REVOKED'), ARCHIVED: by('ARCHIVED') },
        submissions: versions, completionRate: targeted ? Math.round((submitted / targeted) * 1000) / 10 : null,
        recentActivity: recent.map((r) => ({ id: r.id, action: r.action, actor: actors.find((a) => a.id === r.actorUserId)?.fullName ?? (r.actorType === 'SYSTEM' ? 'Hệ thống' : '—'), createdAt: r.createdAt, isSensitive: r.isSensitive })),
      };
    });
  }

  async settings() {
    const killSwitch = await this.ai.killSwitchOn();
    return this.db.tenant(async (tx) => {
      const s = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId: currentTenantId() } });
      const gates = await this.ai.statusIn(tx, null);
      return {
        fileAllowedTypes: s.fileAllowedTypes, fileCeiling: FILE_CEILING, fileMaxMb: Math.round(s.fileMaxBytes / 1024 / 1024), submitGraceSeconds: s.submitGraceSeconds,
        scoreStep: Number(s.scoreStep),
        ai: {
          enabled: s.aiEnabled, approvalRef: s.aiApprovalRef, approvedByName: s.aiApprovedByName, approvedAt: s.aiApprovedAt,
          monthlyLimitUsd: s.aiMonthlyLimitMicros != null ? Number(s.aiMonthlyLimitMicros) / 1e6 : null, alertThresholds: s.aiAlertThresholds,
          platformKillSwitch: killSwitch, gates: gates.gates,
        },
      };
    });
  }

  async updateSettings(dto: SettingsInput) {
    const killSwitch = await this.ai.killSwitchOn();
    await this.db.tenant(async (tx) => {
      const tenantId = currentTenantId();
      const cur = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
      if (dto.fileAllowedTypes && (dto.fileAllowedTypes.some((t) => !FILE_CEILING.includes(t)) || !dto.fileAllowedTypes.length)) throw badRequest('INVALID_FILE_TYPES', `Định dạng phải thuộc: ${FILE_CEILING.join(', ')}.`);
      if (dto.scoreStep !== undefined && ![0.1, 0.25, 0.5, 1].includes(dto.scoreStep)) throw badRequest('INVALID_STEP', 'Bước điểm phải là 0.1, 0.25, 0.5 hoặc 1.');
      const wantsAi = dto.aiEnabled ?? cur.aiEnabled;
      if (dto.aiEnabled === true && !killSwitch) throw conflict('AI_PLATFORM_DISABLED', 'AI chưa được bật trên nền tảng (chờ phê duyệt D11).');
      const approvalRef = dto.aiApprovalRef === undefined ? cur.aiApprovalRef : dto.aiApprovalRef?.trim() || null;
      if (wantsAi && !approvalRef) throw badRequest('AI_APPROVAL_REQUIRED', 'Cần nhập thông tin phê duyệt xử lý dữ liệu trước khi bật AI.');
      await tx.tenantSettings.update({
        where: { tenantId },
        data: {
          fileAllowedTypes: dto.fileAllowedTypes, fileMaxBytes: dto.fileMaxMb ? dto.fileMaxMb * 1024 * 1024 : undefined,
          submitGraceSeconds: dto.submitGraceSeconds, scoreStep: dto.scoreStep !== undefined ? dec(dto.scoreStep) : undefined,
          aiEnabled: dto.aiEnabled, aiApprovalRef: approvalRef, aiApprovedByName: dto.aiApprovedByName === undefined ? undefined : dto.aiApprovedByName,
          aiApprovedAt: dto.aiApprovalRef && dto.aiApprovalRef !== cur.aiApprovalRef ? new Date() : undefined,
          aiMonthlyLimitMicros: dto.aiMonthlyLimitUsd === undefined ? undefined : dto.aiMonthlyLimitUsd === null ? null : BigInt(Math.round(dto.aiMonthlyLimitUsd * 1e6)),
        },
      });
      await this.audit.log(tx, { action: 'tenant.settings.update', resourceType: 'tenant_settings', resourceId: tenantId, metadata: { ...dto } });
    });
    return this.settings();
  }

  auditLogs(q: { q?: string; sensitive?: boolean; page?: number }) {
    const { skip, take, page, pageSize } = pageParams(q.page, 30);
    return this.db.tenant(async (tx) => {
      const where = { ...(q.sensitive ? { isSensitive: true } : {}), ...(q.q ? { action: { contains: q.q, mode: 'insensitive' as const } } : {}) };
      const [total, items] = await Promise.all([tx.auditLog.count({ where }), tx.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })]);
      const actors = await tx.user.findMany({ where: { id: { in: items.map((i) => i.actorUserId).filter(Boolean) as string[] } }, select: { id: true, fullName: true, username: true } });
      return {
        total, page, pageSize,
        items: items.map((i) => ({
          id: i.id, createdAt: i.createdAt, action: i.action, actorType: i.actorType, actor: actors.find((a) => a.id === i.actorUserId) ?? null,
          resourceType: i.resourceType, resourceId: i.resourceId, isSensitive: i.isSensitive, reason: i.reason, metadata: i.metadata, ip: i.ip,
        })),
      };
    });
  }

  assignments(q?: string) {
    return this.db.tenant(async (tx) => {
      const rows = await tx.assignment.findMany({
        where: { deletedAt: null, status: { not: 'DRAFT' }, ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}) },
        include: { subject: true, owner: { include: { user: { select: { fullName: true } } } }, submissions: { select: { latestVersionId: true, status: true } } },
        orderBy: { dueAt: 'desc' }, take: 200,
      });
      return rows.map((a) => ({
        id: a.id, title: a.title, subject: a.subject.name, teacher: a.owner.user.fullName, status: a.status, dueAt: a.dueAt, phase: a.status === 'PUBLISHED' ? phaseOf(a) : null,
        submitted: a.submissions.filter((s) => s.latestVersionId).length, published: a.submissions.filter((s) => s.status === 'PUBLISHED').length,
      }));
    });
  }

  assignmentSubmissions(id: string) {
    return this.db.tenant(async (tx) => {
      const a = await tx.assignment.findFirst({ where: { id, deletedAt: null }, include: { subject: true } });
      if (!a) throw notFound();
      const subs = await tx.submission.findMany({
        where: { assignmentId: id, latestVersionId: { not: null } },
        include: { student: { include: { user: { select: { fullName: true } } } }, versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
        orderBy: { student: { studentCode: 'asc' } },
      });
      return {
        assignment: { id: a.id, title: a.title, subject: a.subject.name, status: a.status },
        rows: subs.map((s) => ({ submissionId: s.id, studentCode: s.student.studentCode, fullName: s.student.user.fullName, status: s.status, submittedAt: s.versions[0]?.submittedAt, isLate: s.versions[0]?.isLate })),
      };
    });
  }

  /** Sensitive read (D7.2, D7.3, O-04): reason required, audit written in the SAME transaction before data is returned. */
  readSubmission(submissionId: string, reason: string) {
    if (!reason || reason.trim().length < 5) throw badRequest('REASON_REQUIRED', 'Vui lòng nhập lý do truy cập (ít nhất 5 ký tự).');
    return this.db.tenant(async (tx) => {
      const s = await tx.submission.findUnique({
        where: { id: submissionId },
        include: { student: { include: { user: { select: { fullName: true } } } }, assignment: { include: { questions: { where: { deletedAt: null }, orderBy: { ordinal: 'asc' }, include: { options: true } } } } },
      });
      if (!s || !s.latestVersionId) throw notFound();
      await this.audit.log(tx, { action: 'submission.content.read', resourceType: 'submission', resourceId: s.id, isSensitive: true, reason: reason.trim().slice(0, 500) });
      const [answers, files, grade] = await Promise.all([
        tx.submissionAnswer.findMany({ where: { versionId: s.latestVersionId } }),
        tx.submissionAttachment.findMany({ where: { versionId: s.latestVersionId }, include: { file: true } }),
        tx.grade.findFirst({ where: { submissionVersionId: s.latestVersionId } }),
      ]);
      return {
        student: { studentCode: s.student.studentCode, fullName: s.student.user.fullName },
        assignment: { id: s.assignmentId, title: s.assignment.title },
        grade: grade ? { status: grade.status, earnedScore: num(grade.earnedScore), maxScore: num(grade.maxScore) } : null,
        questions: s.assignment.questions.map((q) => ({
          ordinal: q.ordinal, type: q.type, content: q.content, options: q.options.map((o) => ({ id: o.id, content: o.content })),
          answer: answers.find((a) => a.questionId === q.id)?.answer ?? null, files: files.filter((f) => f.questionId === q.id).map((f) => fileView(f.file)),
        })),
      };
    });
  }
}
