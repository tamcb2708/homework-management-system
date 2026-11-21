import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Assignment, Prisma, Submission } from '@prisma/client';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from '../notifications/notify.service';
import { GradingService } from '../grading/grading.service';
import { ScopeService } from '../academics/scope.service';
import { badRequest, conflict, gone, notFound } from '../common/errors';
import { currentTenantId, currentUser } from '../common/context';
import { num } from '../common/util';
import { Answer, isEmptyAnswer } from '../grading/engine';
import { closeAt, phaseOf } from '../assignments/phase';
import { fileView } from '../assignments/assignments.service';
import { answerText, sanitizeAnswer } from './answers';
import { answersVisible, canResubmit, personalDeadline, returnedWindowOpen, StudentStatus, studentStatus, submitDeadline, windowOpen } from './rules';

export type StudentFilter = 'all' | 'todo' | 'in_progress' | 'submitted' | 'graded' | 'overdue';

const questionInclude = {
  where: { deletedAt: null },
  orderBy: { ordinal: 'asc' as const },
  include: { options: { orderBy: { ordinal: 'asc' as const } }, attachments: { include: { file: true } }, rubric: { include: { criteria: { orderBy: { ordinal: 'asc' as const } } } } },
};

@Injectable()
export class StudentService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly grading: GradingService,
    private readonly scope: ScopeService,
  ) {}

  /** Assignments visible to the student (BR-11): published, open, not revoked, targeted via active class or directly. */
  async visibleWhere(tx: Tx, studentId: string): Promise<Prisma.AssignmentWhereInput> {
    const classIds = await this.scope.studentActiveClassIds(tx, studentId);
    return {
      deletedAt: null,
      status: { in: ['PUBLISHED', 'ARCHIVED'] },
      openAt: { lte: new Date() },
      targets: { some: { OR: [{ classId: { in: classIds } }, { studentId }] } },
    };
  }

  private async visibleAssignment(tx: Tx, studentId: string, id: string) {
    const a = await tx.assignment.findFirst({ where: { id, ...(await this.visibleWhere(tx, studentId)) } });
    if (!a) throw notFound('Không tìm thấy bài tập.');
    return a;
  }

  list(filter: StudentFilter = 'all', q?: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const rows = await tx.assignment.findMany({
        where: { ...(await this.visibleWhere(tx, me)), ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}) },
        include: { subject: true, owner: { include: { user: { select: { fullName: true } } } }, submissions: { where: { studentId: me } } },
        orderBy: { dueAt: 'asc' },
      });
      const now = new Date();
      const effIds = rows.map((a) => a.submissions[0]?.effectiveGradeId).filter(Boolean) as string[];
      const grades = effIds.length ? await tx.grade.findMany({ where: { id: { in: effIds }, status: 'PUBLISHED' } }) : [];
      const items = rows.map((a) => {
        const s = a.submissions[0] ?? null;
        const status = studentStatus(a, s, now);
        const g = grades.find((x) => x.id === s?.effectiveGradeId);
        return {
          id: a.id, title: a.title, subject: { id: a.subject.id, name: a.subject.name }, teacher: a.owner.user.fullName,
          openAt: a.openAt, dueAt: a.dueAt, closeAt: closeAt(a), maxScore: num(a.maxScore), status, phase: phaseOf(a, now),
          timeLimitMinutes: a.timeLimitMinutes, earnedScore: g ? num(g.earnedScore) : null,
        };
      });
      const match: Record<StudentFilter, (s: StudentStatus) => boolean> = {
        all: () => true, todo: (s) => s === 'NOT_STARTED' || s === 'RETURNED', in_progress: (s) => s === 'IN_PROGRESS',
        submitted: (s) => s === 'SUBMITTED', graded: (s) => s === 'GRADED', overdue: (s) => s === 'MISSING',
      };
      return items.filter((i) => match[filter]?.(i.status) ?? true);
    });
  }

  detail(id: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const a0 = await this.visibleAssignment(tx, me, id);
      const a = await tx.assignment.findUniqueOrThrow({
        where: { id: a0.id },
        include: { subject: true, owner: { include: { user: { select: { fullName: true } } } }, attachments: { include: { file: true } }, questions: questionInclude },
      });
      const s = await tx.submission.findUnique({
        where: { tenantId_assignmentId_studentId: { tenantId: currentTenantId(), assignmentId: id, studentId: me } },
        include: { versions: { orderBy: { versionNo: 'desc' } } },
      });
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId: currentTenantId() } });
      const now = new Date();
      const status = studentStatus(a, s, now);
      const deadline = s && s.status === 'IN_PROGRESS' ? submitDeadline(a, s) : null;
      const effective = s?.effectiveGradeId ? await tx.grade.findFirst({ where: { id: s.effectiveGradeId, status: 'PUBLISHED' } }) : null;
      const canStart = !s ? windowOpen(a, now)
        : s.status === 'RETURNED' ? returnedWindowOpen(a, s, now)
        : s.status === 'IN_PROGRESS' ? !!deadline && now.getTime() <= deadline.getTime() + (settings?.submitGraceSeconds ?? 30) * 1000
        : canResubmit(a, s, now);
      const draftFileIds = s?.status === 'IN_PROGRESS' ? Object.values((s.draft ?? {}) as Record<string, any>).flatMap((v) => (Array.isArray(v?.fileIds) ? v.fileIds : [])) : [];
      const draftFiles = draftFileIds.length ? await tx.fileObject.findMany({ where: { id: { in: draftFileIds }, uploadedBy: me, status: 'ACTIVE' } }) : [];
      return {
        serverNow: now,
        draftFiles: draftFiles.map(fileView),
        assignment: {
          id: a.id, title: a.title, description: a.description, instructions: a.instructions, topic: a.topic,
          subject: { id: a.subject.id, name: a.subject.name }, teacher: a.owner.user.fullName,
          openAt: a.openAt, dueAt: a.dueAt, allowLate: a.allowLate, lateUntil: a.lateUntil, closeAt: closeAt(a), phase: phaseOf(a, now),
          timeLimitMinutes: a.timeLimitMinutes, allowResubmit: a.allowResubmit, maxAttempts: a.maxAttempts,
          maxScore: num(a.maxScore), passScore: num(a.passScore), revoked: a.status !== 'PUBLISHED' && a.status !== 'ARCHIVED',
          attachments: a.attachments.map((x) => fileView(x.file)),
          // Student serializer: never includes isCorrect, config secrets, reference answers or rubric internals (BR-12, S21).
          questions: a.questions.map((q) => ({
            id: q.id, ordinal: q.ordinal, type: q.type, content: q.content, points: num(q.points), isRequired: q.isRequired,
            options: q.options.map((o) => ({ id: o.id, content: o.content })),
            maxFiles: q.type === 'FILE_UPLOAD' ? Number((q.config as any)?.maxFiles ?? 3) : undefined,
            rubric: q.rubric ? q.rubric.criteria.map((c) => ({ name: c.name, maxPoints: num(c.maxPoints) })) : undefined,
            attachments: q.attachments.map((x) => fileView(x.file)),
          })),
        },
        submission: s ? {
          id: s.id, status, rawStatus: s.status, startedAt: s.startedAt, deadline, draft: s.status === 'IN_PROGRESS' ? s.draft : null,
          draftRevision: s.draftRevision, draftUpdatedAt: s.draftUpdatedAt, attemptCount: s.attemptCount,
          returnedReason: s.status === 'RETURNED' || s.returnedAt ? s.returnedReason : null, returnedDueAt: s.returnedDueAt,
          versions: s.versions.map((v) => ({ versionNo: v.versionNo, submittedAt: v.submittedAt, isLate: v.isLate, source: v.source })),
          publishedScore: effective ? num(effective.earnedScore) : null, hasResult: !!effective,
        } : null,
        actions: { canStart, canResubmit: !!s && canResubmit(a, s, now), status },
        graceSeconds: settings?.submitGraceSeconds ?? 30,
      };
    });
  }

  async start(assignmentId: string) {
    const me = currentUser().id;
    await this.db.tenant(async (tx) => {
      const a = await this.visibleAssignment(tx, me, assignmentId);
      const tenantId = currentTenantId();
      const now = new Date();
      const s = await tx.submission.findUnique({ where: { tenantId_assignmentId_studentId: { tenantId, assignmentId, studentId: me } } });
      if (!s) {
        if (!windowOpen(a, now)) throw conflict('NOT_OPEN', a.status !== 'PUBLISHED' ? 'Bài tập không còn mở.' : 'Bài tập chưa mở hoặc đã hết hạn nộp.');
        await tx.submission.create({
          data: { tenantId, assignmentId, studentId: me, status: 'IN_PROGRESS', startedAt: now, deadlineAt: personalDeadline(a, now, closeAt(a)) },
        }).catch((e) => { if (e?.code !== 'P2002') throw e; }); // concurrent start: second request just reads
        await this.audit.log(tx, { action: 'submission.start', resourceType: 'assignment', resourceId: assignmentId });
        return;
      }
      if (s.status === 'IN_PROGRESS') return;
      let returned = false;
      if (s.status === 'RETURNED') {
        if (!returnedWindowOpen(a, s, now)) throw conflict('NOT_OPEN', 'Đã hết thời hạn nộp lại.');
        returned = true;
      } else if (!canResubmit(a, s, now)) {
        throw conflict('RESUBMIT_NOT_ALLOWED', a.allowResubmit ? 'Bạn đã hết lượt nộp hoặc đã hết hạn.' : 'Giáo viên không cho phép nộp lại bài này.');
      }
      const draft = await this.draftFromVersion(tx, s.latestVersionId);
      const base = returned ? (s.returnedDueAt ?? closeAt(a)) : closeAt(a);
      await tx.submission.update({
        where: { id: s.id },
        data: { status: 'IN_PROGRESS', startedAt: now, deadlineAt: personalDeadline(a, now, base), draft, draftRevision: { increment: 1 }, returnedAt: returned ? (s.returnedAt ?? now) : null },
      });
      // HS nộp lại: hủy job AI của phiên bản cũ (E16) – no-op while AI is disabled.
      await tx.aiGradingJob.updateMany({ where: { version: { submissionId: s.id }, status: { in: ['QUEUED', 'RETRYING'] } }, data: { status: 'CANCELLED', finishedAt: now } });
      await this.audit.log(tx, { action: returned ? 'submission.resume_returned' : 'submission.resubmit_start', resourceType: 'submission', resourceId: s.id });
    });
    return this.detail(assignmentId);
  }

  private async draftFromVersion(tx: Tx, versionId: string | null): Promise<Prisma.InputJsonObject> {
    if (!versionId) return {};
    const rows = await tx.submissionAnswer.findMany({ where: { versionId } });
    return Object.fromEntries(rows.map((r) => [r.questionId, r.answer as Prisma.InputJsonValue]));
  }

  private async own(tx: Tx, submissionId: string) {
    const s = await tx.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
    if (!s || s.studentId !== currentUser().id) throw notFound();
    return s;
  }

  private async sanitizeDraft(tx: Tx, a: Assignment, answers: Record<string, unknown>, studentId: string) {
    const qs = await tx.question.findMany({ where: { assignmentId: a.id, deletedAt: null }, include: { options: true } });
    const out: Record<string, Answer> = {};
    const fileIds: string[] = [];
    for (const q of qs) {
      const v = sanitizeAnswer(q, answers?.[q.id]);
      if (v) { out[q.id] = v; if (v.fileIds) fileIds.push(...v.fileIds); }
    }
    if (fileIds.length) {
      const owned = await tx.fileObject.count({ where: { id: { in: fileIds }, uploadedBy: studentId, purpose: 'ANSWER_UPLOAD', status: 'ACTIVE' } });
      if (owned !== new Set(fileIds).size) throw badRequest('INVALID_FILE', 'Tệp đính kèm không hợp lệ.');
    }
    return { answers: out, questions: qs };
  }

  async saveDraft(submissionId: string, answers: Record<string, unknown>, revision: number) {
    return this.db.tenant(async (tx) => {
      const s = await this.own(tx, submissionId);
      if (s.assignment.status !== 'PUBLISHED') throw gone('ASSIGNMENT_REVOKED', 'Bài tập đã bị thu hồi.');
      if (s.status !== 'IN_PROGRESS') throw conflict('NOT_EDITABLE', 'Bài làm đã nộp, không thể chỉnh sửa.');
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId: currentTenantId() } });
      const deadline = submitDeadline(s.assignment, s);
      if (deadline && Date.now() > deadline.getTime() + (settings?.submitGraceSeconds ?? 30) * 1000) throw conflict('DEADLINE_PASSED', 'Đã hết thời gian làm bài.');
      const { answers: clean } = await this.sanitizeDraft(tx, s.assignment, answers, s.studentId);
      // Optimistic concurrency: a stale tab cannot overwrite newer work (E9).
      const r = await tx.submission.updateMany({
        where: { id: s.id, draftRevision: revision, status: 'IN_PROGRESS' },
        data: { draft: clean as Prisma.InputJsonObject, draftRevision: revision + 1, draftUpdatedAt: new Date() },
      });
      if (r.count !== 1) throw conflict('STALE_DRAFT', 'Bài làm đã được cập nhật ở cửa sổ khác. Vui lòng tải lại trang.');
      return { revision: revision + 1, savedAt: new Date() };
    });
  }

  async submit(submissionId: string, idempotencyKey: string | undefined) {
    const key = (idempotencyKey ?? '').trim();
    if (!/^[\w-]{8,100}$/.test(key)) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Thiếu Idempotency-Key hợp lệ.');
    return this.db.tenant(async (tx) => {
      const s = await this.own(tx, submissionId);
      return this.doSubmit(tx, s.id, { key, auto: false });
    });
  }

  /** Core submit (shared with the auto-submit scheduler). Row lock + idempotency key → exactly one version (BR-27). */
  async doSubmit(tx: Tx, submissionId: string, opts: { key: string; auto: boolean }) {
    await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submissionId}::uuid FOR UPDATE`;
    const replay = await tx.submissionVersion.findUnique({ where: { submissionId_idempotencyKey: { submissionId, idempotencyKey: opts.key } } });
    if (replay) return { versionNo: replay.versionNo, submittedAt: replay.submittedAt, isLate: replay.isLate, replayed: true };
    const s = (await tx.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: true } })) as Submission & { assignment: Assignment };
    const a = s.assignment;
    if (s.status !== 'IN_PROGRESS') throw conflict('ALREADY_SUBMITTED', 'Bài làm đã được nộp.');
    if (a.status !== 'PUBLISHED') throw gone('ASSIGNMENT_REVOKED', 'Bài tập đã bị thu hồi.');
    const tenantId = s.tenantId;
    const settings = await tx.tenantSettings.findUnique({ where: { tenantId } });
    const now = new Date();
    if (!opts.auto) {
      const deadline = submitDeadline(a, s);
      if (deadline && now.getTime() > deadline.getTime() + (settings?.submitGraceSeconds ?? 30) * 1000) throw conflict('DEADLINE_PASSED', 'Đã hết hạn nộp bài.');
    }
    const { answers, questions } = await this.sanitizeDraft(tx, a, (s.draft ?? {}) as Record<string, unknown>, s.studentId);
    if (!opts.auto) {
      const missing = questions.filter((q) => q.isRequired && isEmptyAnswer(q.type, answers[q.id])).map((q) => q.ordinal);
      if (missing.length) throw badRequest('REQUIRED_MISSING', `Bạn chưa trả lời câu bắt buộc: ${missing.join(', ')}.`, { questions: missing });
    }
    const last = await tx.submissionVersion.aggregate({ where: { submissionId }, _max: { versionNo: true } });
    const countsAsAttempt = !s.returnedAt;
    const content = JSON.stringify(questions.map((q) => [q.id, answers[q.id] ?? null]));
    const v = await tx.submissionVersion.create({
      data: {
        tenantId, submissionId, versionNo: (last._max.versionNo ?? 0) + 1, submittedAt: now, isLate: !!a.dueAt && now > a.dueAt,
        source: opts.auto ? 'AUTO_TIMEOUT' : 'STUDENT', countsAsAttempt, idempotencyKey: opts.key,
        contentHash: createHash('sha256').update(content).digest('hex'), submittedBy: opts.auto ? null : s.studentId,
      },
    });
    const rows = questions.filter((q) => answers[q.id]).map((q) => ({
      tenantId, versionId: v.id, questionId: q.id, answer: answers[q.id] as Prisma.InputJsonObject, answerText: answerText(q.type, answers[q.id]),
    }));
    if (rows.length) await tx.submissionAnswer.createMany({ data: rows });
    const files = questions.flatMap((q) => (answers[q.id]?.fileIds ?? []).map((fileId) => ({ tenantId, versionId: v.id, questionId: q.id, fileId })));
    if (files.length) await tx.submissionAttachment.createMany({ data: files });
    await tx.submission.update({
      where: { id: submissionId },
      data: {
        status: 'SUBMITTED', latestVersionId: v.id, attemptCount: countsAsAttempt ? { increment: 1 } : undefined,
        returnedAt: null, returnedDueAt: null, draft: {}, draftRevision: { increment: 1 },
      },
    });
    await this.grading.createForVersion(tx, { tenantId, submissionId, versionId: v.id, assignment: a, questions, answers });
    const bucket = Math.floor(now.getTime() / 300_000);
    await this.notify.send(tx, tenantId, [a.ownerTeacherId], {
      type: 'SUBMISSION_RECEIVED', title: `Có bài nộp mới: ${a.title}`, link: `/teacher/assignments/${a.id}/submissions`,
      dedupe: (u) => `sub:${a.id}:${bucket}:${u}`,
    });
    await this.audit.log(tx, { action: opts.auto ? 'submission.auto_submit' : 'submission.submit', resourceType: 'submission', resourceId: submissionId, metadata: { versionNo: v.versionNo, isLate: v.isLate } }, tenantId);
    return { versionNo: v.versionNo, submittedAt: v.submittedAt, isLate: v.isLate, replayed: false };
  }

  /** Published result (SUB-13). Only the student's own, only after publication. */
  result(submissionId: string, versionNo?: number) {
    return this.db.tenant(async (tx) => {
      const s = await this.own(tx, submissionId);
      const grades = await tx.grade.findMany({ where: { submissionId: s.id, status: 'PUBLISHED' }, include: { version: true } });
      if (!grades.length) throw notFound('Chưa có kết quả được công bố.');
      const g = versionNo ? grades.find((x) => x.version.versionNo === versionNo) : grades.find((x) => x.id === s.effectiveGradeId) ?? grades[0];
      if (!g) throw notFound('Chưa có kết quả được công bố.');
      const a = await tx.assignment.findUniqueOrThrow({ where: { id: s.assignmentId }, include: { subject: true, questions: questionInclude } });
      const [answers, details] = await Promise.all([
        tx.submissionAnswer.findMany({ where: { versionId: g.submissionVersionId } }),
        tx.gradeDetail.findMany({ where: { gradeId: g.id }, include: { criteria: { include: { criterion: true } } } }),
      ]);
      const attachments = await tx.submissionAttachment.findMany({ where: { versionId: g.submissionVersionId }, include: { file: true } });
      const showKey = answersVisible(a, true, true);
      return {
        assignment: { id: a.id, title: a.title, subject: a.subject.name, maxScore: num(g.maxScore), passScore: num(g.passScore) },
        versionNo: g.version.versionNo, submittedAt: g.version.submittedAt, isLate: g.version.isLate, publishedAt: g.publishedAt,
        earnedScore: num(g.earnedScore), maxScore: num(g.maxScore), passed: g.passed,
        teacherFeedback: g.teacherFeedback,
        aiFeedback: a.aiFeedbackVisible ? g.aiFeedbackApproved : null, // D10: only when teacher allowed AND approved
        answerKeyVisible: showKey,
        publishedVersions: grades.map((x) => ({ versionNo: x.version.versionNo, earnedScore: num(x.earnedScore) })).sort((x, y) => x.versionNo - y.versionNo),
        questions: a.questions.map((q) => {
          const d = details.find((x) => x.questionId === q.id);
          const ans = answers.find((x) => x.questionId === q.id)?.answer ?? null;
          return {
            id: q.id, ordinal: q.ordinal, type: q.type, content: q.content, maxScore: num(d?.maxScore ?? q.points), earnedScore: num(d?.earnedScore),
            feedback: d?.feedback ?? null, isMarkedWrong: d?.isMarkedWrong ?? false, answer: ans,
            files: attachments.filter((x) => x.questionId === q.id).map((x) => fileView(x.file)),
            options: q.options.map((o) => ({ id: o.id, content: o.content, isCorrect: showKey ? o.isCorrect : undefined })),
            acceptedAnswers: showKey && q.type === 'SHORT_ANSWER' ? ((q.config as any)?.accepted ?? []) : undefined,
            explanation: showKey ? q.explanation : null,
            criteria: d?.criteria.map((c) => ({ name: c.criterion.name, earnedScore: num(c.earnedScore), maxScore: num(c.maxScore), feedback: c.feedback })) ?? [],
          };
        }),
      };
    });
  }
}
