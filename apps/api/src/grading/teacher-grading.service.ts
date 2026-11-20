import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from '../notifications/notify.service';
import { ScopeService } from '../academics/scope.service';
import { AiGateService } from '../ai-grading/ai-gate.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { currentTenantId, currentUser } from '../common/context';
import { num } from '../common/util';
import { fileView } from '../assignments/assignments.service';
import { closeAt, phaseOf } from '../assignments/phase';
import { GradingService } from './grading.service';
import { FeedbackDto, ReturnDto, ScoreDto } from './dto';

const STATUS_VI: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu', IN_PROGRESS: 'Đang làm', SUBMITTED: 'Đã nộp', GRADING: 'Đang chấm', GRADED: 'Đã chấm',
  PUBLISHED: 'Đã công bố', RETURNED: 'Cần nộp lại', MISSING: 'Không nộp',
};

@Injectable()
export class TeacherGradingService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly scope: ScopeService,
    private readonly grading: GradingService,
    private readonly ai: AiGateService,
  ) {}

  submissionView(submissionId: string, versionNo?: number) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const s0 = await this.scope.teacherSubmission(tx, me, submissionId);
      const s = await tx.submission.findUniqueOrThrow({
        where: { id: s0.id },
        include: { student: { include: { user: { select: { fullName: true } } } }, versions: { orderBy: { versionNo: 'desc' } } },
      });
      const a = await tx.assignment.findUniqueOrThrow({
        where: { id: s.assignmentId },
        include: { subject: true, questions: { where: { deletedAt: null }, orderBy: { ordinal: 'asc' }, include: { options: { orderBy: { ordinal: 'asc' } }, rubric: { include: { criteria: { orderBy: { ordinal: 'asc' } } } } } } },
      });
      const version = versionNo ? s.versions.find((v) => v.versionNo === versionNo) : s.versions[0];
      const [answers, files, grade, settings, aiStatus, siblings] = await Promise.all([
        version ? tx.submissionAnswer.findMany({ where: { versionId: version.id } }) : [],
        version ? tx.submissionAttachment.findMany({ where: { versionId: version.id }, include: { file: true } }) : [],
        version ? tx.grade.findUnique({ where: { tenantId_submissionVersionId: { tenantId: currentTenantId(), submissionVersionId: version.id } }, include: { details: { include: { criteria: true } }, history: { orderBy: { createdAt: 'desc' }, take: 50 } } }) : null,
        tx.tenantSettings.findUnique({ where: { tenantId: currentTenantId() } }),
        this.ai.statusIn(tx, a),
        tx.submission.findMany({ where: { assignmentId: a.id, latestVersionId: { not: null } }, select: { id: true, student: { select: { studentCode: true } } }, orderBy: { student: { studentCode: 'asc' } } }),
      ]);
      const idx = siblings.findIndex((x) => x.id === s.id);
      const actors = grade ? await tx.user.findMany({ where: { id: { in: grade.history.map((h) => h.changedBy).filter(Boolean) as string[] } }, select: { id: true, fullName: true } }) : [];
      return {
        submission: {
          id: s.id, status: s.status, attemptCount: s.attemptCount, latestVersionNo: s.versions[0]?.versionNo ?? null,
          student: { id: s.studentId, studentCode: s.student.studentCode, fullName: s.student.user.fullName },
          versions: s.versions.map((v) => ({ versionNo: v.versionNo, submittedAt: v.submittedAt, isLate: v.isLate, source: v.source })),
          returnedReason: s.returnedReason,
        },
        version: version ? { versionNo: version.versionNo, submittedAt: version.submittedAt, isLate: version.isLate, source: version.source, isLatest: version.id === s.latestVersionId } : null,
        assignment: {
          id: a.id, title: a.title, subject: a.subject.name, maxScore: num(a.maxScore), passScore: num(a.passScore), dueAt: a.dueAt, closeAt: closeAt(a),
          phase: a.status === 'PUBLISHED' ? phaseOf(a) : null, aiFeedbackVisible: a.aiFeedbackVisible,
        },
        scoreStep: Number(settings?.scoreStep ?? 0.25),
        nav: { prev: idx > 0 ? siblings[idx - 1].id : null, next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null, position: idx + 1, total: siblings.length },
        grade: grade ? {
          id: grade.id, status: grade.status, earnedScore: num(grade.earnedScore), maxScore: num(grade.maxScore), passed: grade.passed,
          teacherFeedback: grade.teacherFeedback, aiFeedbackApproved: grade.aiFeedbackApproved, publishedAt: grade.publishedAt,
          history: grade.history.map((h) => ({
            id: h.id, changeType: h.changeType, oldScore: num(h.oldScore), newScore: num(h.newScore), reason: h.reason, createdAt: h.createdAt,
            questionId: grade.details.find((d) => d.id === h.gradeDetailId)?.questionId ?? null, actor: actors.find((x) => x.id === h.changedBy)?.fullName ?? 'Hệ thống',
          })),
        } : null,
        ai: aiStatus,
        questions: a.questions.map((q) => {
          const d = grade?.details.find((x) => x.questionId === q.id);
          return {
            id: q.id, ordinal: q.ordinal, type: q.type, content: q.content, points: num(q.points), config: q.config, referenceAnswer: q.referenceAnswer,
            options: q.options.map((o) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })),
            rubric: q.rubric ? q.rubric.criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, maxPoints: num(c.maxPoints) })) : null,
            answer: answers.find((x) => x.questionId === q.id)?.answer ?? null,
            files: files.filter((f) => f.questionId === q.id).map((f) => fileView(f.file)),
            grade: d ? {
              detailId: d.id, status: d.status, source: d.source, earnedScore: num(d.earnedScore), maxScore: num(d.maxScore), feedback: d.feedback, isMarkedWrong: d.isMarkedWrong,
              criteria: d.criteria.map((c) => ({ criterionId: c.rubricCriterionId, score: num(c.earnedScore), feedback: c.feedback })),
            } : null,
          };
        }),
      };
    });
  }

  private async detailInScope(tx: Tx, detailId: string) {
    const d = await tx.gradeDetail.findUnique({ where: { id: detailId }, include: { grade: { include: { submission: { include: { assignment: true } } } } } });
    if (!d) throw notFound();
    await this.scope.teacherSubmission(tx, currentUser().id, d.grade.submissionId);
    return d;
  }

  async setScore(detailId: string, dto: ScoreDto) {
    const submissionId = await this.db.tenant(async (tx) => {
      const d = await this.detailInScope(tx, detailId);
      if (d.grade.submission.latestVersionId !== d.grade.submissionVersionId) throw conflict('SUPERSEDED', 'Học sinh đã nộp phiên bản mới hơn; hãy chấm phiên bản mới nhất.');
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId: currentTenantId() } });
      await this.grading.setScore(tx, {
        tenantId: currentTenantId(), detailId, input: dto, scoreStep: Number(settings?.scoreStep ?? 0.25),
        studentId: d.grade.submission.studentId, assignmentTitle: d.grade.submission.assignment.title, link: `/student/assignments/${d.grade.submission.assignmentId}`,
      });
      return d.grade.submissionId;
    });
    return this.submissionView(submissionId);
  }

  async setFeedback(gradeId: string, dto: FeedbackDto) {
    const submissionId = await this.db.tenant(async (tx) => {
      const g = await tx.grade.findUnique({ where: { id: gradeId } });
      if (!g) throw notFound();
      await this.scope.teacherSubmission(tx, currentUser().id, g.submissionId);
      await this.grading.setOverallFeedback(tx, { tenantId: currentTenantId(), gradeId, ...dto });
      await this.audit.log(tx, { action: 'grade.feedback', resourceType: 'grade', resourceId: gradeId });
      return g.submissionId;
    });
    return this.submissionView(submissionId);
  }

  publish(gradeIds: string[]) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const allowed: string[] = [];
      const skipped: { gradeId: string; reason: string }[] = [];
      for (const id of [...new Set(gradeIds)]) {
        const g = await tx.grade.findUnique({ where: { id } });
        const ok = g && (await this.scope.teacherSubmission(tx, me, g.submissionId).then(() => true, () => false));
        if (ok) allowed.push(id); else skipped.push({ gradeId: id, reason: 'Không tìm thấy' });
      }
      const r = await this.grading.publish(tx, { tenantId: currentTenantId(), gradeIds: allowed, link: () => '' });
      return { published: r.published, skipped: [...skipped, ...r.skipped] };
    });
  }

  async publishAll(assignmentId: string) {
    const me = currentUser().id;
    const ids = await this.db.tenant(async (tx) => {
      await this.scope.ownAssignment(tx, me, assignmentId);
      const subs = await tx.submission.findMany({ where: { assignmentId, status: 'GRADED' }, select: { latestVersionId: true } });
      const grades = await tx.grade.findMany({ where: { submissionVersionId: { in: subs.map((s) => s.latestVersionId!).filter(Boolean) }, status: 'GRADED' }, select: { id: true } });
      return grades.map((g) => g.id);
    });
    if (!ids.length) return { published: [], skipped: [] };
    return this.publish(ids);
  }

  returnToStudent(assignmentId: string, dto: ReturnDto) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, assignmentId);
      if (a.status !== 'PUBLISHED') throw conflict('INVALID_STATE', 'Bài tập không ở trạng thái đang giao.');
      if (!(await this.scope.teacherSeesStudentInSubject(tx, me, dto.studentId, a.subjectId))) throw notFound();
      const recipients = await this.scope.recipients(tx, a.id);
      if (!recipients.includes(dto.studentId)) throw notFound();
      const now = new Date();
      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      if (dueAt && dueAt <= now) throw badRequest('INVALID_DATES', 'Hạn nộp lại phải ở tương lai.');
      if (!dueAt && phaseOf(a, now) === 'CLOSED') throw badRequest('DUE_REQUIRED', 'Bài đã hết hạn – vui lòng đặt hạn nộp lại.');
      const tenantId = currentTenantId();
      const existing = await tx.submission.findUnique({ where: { tenantId_assignmentId_studentId: { tenantId, assignmentId, studentId: dto.studentId } } });
      if (existing?.status === 'IN_PROGRESS' || existing?.status === 'RETURNED') throw conflict('INVALID_STATE', 'Học sinh đang làm bài hoặc đã được yêu cầu nộp lại.');
      const data = { status: 'RETURNED' as const, returnedAt: now, returnedReason: dto.reason.trim(), returnedDueAt: dueAt };
      const s = existing
        ? await tx.submission.update({ where: { id: existing.id }, data })
        : await tx.submission.create({ data: { tenantId, assignmentId, studentId: dto.studentId, ...data } });
      await this.notify.send(tx, tenantId, [dto.studentId], {
        type: 'SUBMISSION_RETURNED', title: `Giáo viên yêu cầu nộp lại: ${a.title}`, body: dto.reason.trim().slice(0, 300), link: `/student/assignments/${a.id}`,
      });
      await this.audit.log(tx, { action: 'submission.return', resourceType: 'submission', resourceId: s.id, metadata: { reason: dto.reason, dueAt } });
      return { ok: true, submissionId: s.id };
    });
  }

  /** Gradebook export (RPT-05). Logged as sensitive export (auth §8). */
  async exportXlsx(assignmentId: string): Promise<{ filename: string; buffer: Buffer }> {
    const me = currentUser().id;
    const data = await this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, assignmentId);
      const recipients = await this.scope.recipients(tx, a.id);
      const students = await tx.student.findMany({ where: { userId: { in: recipients } }, include: { user: { select: { fullName: true } }, enrollments: { where: { leftAt: null }, include: { class: true } } } });
      const subs = await tx.submission.findMany({ where: { assignmentId }, include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 }, grades: true } });
      await this.audit.log(tx, { action: 'report.export', resourceType: 'assignment', resourceId: assignmentId, isSensitive: true });
      return { a, students, subs };
    });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Homework Management System';
    const ws = wb.addWorksheet('Bảng điểm');
    ws.columns = [
      { header: 'Mã HS', key: 'code', width: 12 }, { header: 'Họ tên', key: 'name', width: 28 }, { header: 'Lớp', key: 'cls', width: 10 },
      { header: 'Trạng thái', key: 'status', width: 16 }, { header: 'Nộp lúc', key: 'at', width: 20 }, { header: 'Nộp muộn', key: 'late', width: 10 },
      { header: 'Lần nộp', key: 'att', width: 9 }, { header: 'Điểm', key: 'score', width: 9 }, { header: 'Tổng điểm', key: 'max', width: 10 }, { header: '%', key: 'pct', width: 8 },
    ];
    ws.getRow(1).font = { bold: true };
    const closed = phaseOf(data.a) === 'CLOSED';
    for (const st of data.students.sort((x, y) => x.studentCode.localeCompare(y.studentCode))) {
      const s = data.subs.find((x) => x.studentId === st.userId);
      const g = s?.grades.find((x) => x.submissionVersionId === s.latestVersionId);
      let status = s ? s.status : 'NOT_STARTED';
      if ((!s || (s.status === 'IN_PROGRESS' && !s.latestVersionId)) && closed) status = 'MISSING';
      const score = num(g?.earnedScore);
      const max = num(data.a.maxScore)!;
      ws.addRow({
        code: st.studentCode, name: st.user.fullName, cls: st.enrollments.map((e) => e.class.code).join(', '), status: STATUS_VI[status] ?? status,
        at: s?.versions[0]?.submittedAt ? s.versions[0].submittedAt.toISOString().replace('T', ' ').slice(0, 16) : '', late: s?.versions[0]?.isLate ? 'Có' : '',
        att: s?.attemptCount ?? 0, score: score ?? '', max, pct: score !== null && max ? Math.round((score / max) * 1000) / 10 : '',
      });
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const safe = data.a.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60);
    return { filename: `bang-diem_${safe}.xlsx`, buffer };
  }
}
