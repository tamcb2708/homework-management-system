import { Injectable } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from '../notifications/notify.service';
import { GradingService } from '../grading/grading.service';
import { ScopeService } from '../academics/scope.service';
import { badRequest, conflict, notFound, unprocessable } from '../common/errors';
import { currentTenantId, currentUser } from '../common/context';
import { dec, num } from '../common/util';
import { answerKeyProblem } from '../grading/engine';
import { closeAt, phaseOf } from './phase';
import { CreateAssignmentDto, ListAssignmentsQuery, PublishDto, QuestionDto, ReorderDto, UpdateAssignmentDto } from './dto';

const CHOICE: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'];

/** Only whitelisted keys per question type are stored. */
export function sanitizeConfig(type: QuestionType, raw: Record<string, any> = {}): Prisma.InputJsonObject {
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return { scoring: raw.scoring === 'PARTIAL' ? 'PARTIAL' : 'ALL_OR_NOTHING' };
    case 'SHORT_ANSWER': {
      const accepted = Array.isArray(raw.accepted) ? raw.accepted.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 200)).slice(0, 20) : [];
      const tol = typeof raw.numericTolerance === 'number' && raw.numericTolerance >= 0 && raw.numericTolerance <= 1e6 ? raw.numericTolerance : null;
      return { accepted, caseSensitive: raw.caseSensitive === true, ignoreDiacritics: raw.ignoreDiacritics === true, numericTolerance: tol, zeroIfNoMatch: raw.zeroIfNoMatch === true };
    }
    case 'FILE_UPLOAD':
      return { maxFiles: Number.isInteger(raw.maxFiles) && raw.maxFiles >= 1 && raw.maxFiles <= 10 ? raw.maxFiles : 3 };
    default:
      return {};
  }
}

const fullInclude = {
  subject: true,
  targets: { include: { class: { select: { id: true, code: true, name: true } }, student: { include: { user: { select: { fullName: true } } } } } },
  attachments: { include: { file: true } },
  questions: {
    where: { deletedAt: null },
    orderBy: { ordinal: 'asc' as const },
    include: { options: { orderBy: { ordinal: 'asc' as const } }, rubric: { include: { criteria: { orderBy: { ordinal: 'asc' as const } } } }, attachments: { include: { file: true } } },
  },
} satisfies Prisma.AssignmentInclude;

type FullAssignment = Prisma.AssignmentGetPayload<{ include: typeof fullInclude }>;

export const fileView = (f: { id: string; originalName: string; sizeBytes: number; mimeType: string }) => ({ id: f.id, name: f.originalName, size: f.sizeBytes, mimeType: f.mimeType });

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly grading: GradingService,
    private readonly scope: ScopeService,
  ) {}

  /** Classes & subjects the teacher can assign to (form options). */
  teachingOptions() {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const rows = await tx.classTeacher.findMany({
        where: { teacherId: me, unassignedAt: null, class: { archivedAt: null } },
        include: { class: { include: { students: { where: { leftAt: null }, include: { student: { include: { user: { select: { fullName: true } } } } } } } }, subject: true },
      });
      const subjects = new Map<string, { id: string; code: string; name: string }>();
      const classes = rows.map((r) => {
        subjects.set(r.subjectId, { id: r.subject.id, code: r.subject.code, name: r.subject.name });
        return {
          classId: r.classId, code: r.class.code, name: r.class.name, subjectId: r.subjectId,
          students: r.class.students.map((s) => ({ id: s.studentId, studentCode: s.student.studentCode, fullName: s.student.user.fullName })).sort((a, b) => a.studentCode.localeCompare(b.studentCode)),
        };
      });
      return { subjects: [...subjects.values()], classes };
    });
  }

  list(q: ListAssignmentsQuery) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const rows = await tx.assignment.findMany({
        where: {
          ownerTeacherId: me, deletedAt: null,
          ...(q.status ? { status: q.status as any } : { status: { not: 'ARCHIVED' } }),
          ...(q.subjectId ? { subjectId: q.subjectId } : {}),
          ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          subject: { select: { name: true, code: true } },
          targets: { include: { class: { select: { code: true } } } },
          _count: { select: { questions: { where: { deletedAt: null } } } },
          submissions: { select: { status: true, latestVersionId: true } },
        },
      });
      const now = new Date();
      return Promise.all(rows.map(async (a) => {
        const recipients = a.status === 'DRAFT' ? 0 : (await this.scope.recipients(tx, a.id)).length;
        const submitted = a.submissions.filter((s) => s.latestVersionId).length;
        return {
          id: a.id, title: a.title, status: a.status, subject: a.subject, openAt: a.openAt, dueAt: a.dueAt, lateUntil: a.lateUntil, allowLate: a.allowLate,
          phase: a.status === 'PUBLISHED' ? phaseOf(a, now) : null, maxScore: num(a.maxScore), questionCount: a._count.questions,
          targets: a.targets.map((t) => t.class?.code ?? 'HS').filter((v, i, arr) => arr.indexOf(v) === i),
          recipients, submitted,
          toGrade: a.submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADING').length,
          toPublish: a.submissions.filter((s) => s.status === 'GRADED').length,
          updatedAt: a.updatedAt,
        };
      }));
    });
  }

  async get(id: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      await this.scope.ownAssignment(tx, me, id);
      const a = await tx.assignment.findUniqueOrThrow({ where: { id }, include: fullInclude });
      const hasSubmissions = (await tx.submissionVersion.count({ where: { submission: { assignmentId: id } } })) > 0;
      return this.serialize(a, hasSubmissions);
    });
  }

  private serialize(a: FullAssignment, hasSubmissions: boolean) {
    return {
      id: a.id, title: a.title, description: a.description, instructions: a.instructions, topic: a.topic, status: a.status,
      subject: { id: a.subject.id, code: a.subject.code, name: a.subject.name },
      openAt: a.openAt, dueAt: a.dueAt, allowLate: a.allowLate, lateUntil: a.lateUntil, timeLimitMinutes: a.timeLimitMinutes,
      allowResubmit: a.allowResubmit, maxAttempts: a.maxAttempts, gradingPolicy: a.gradingPolicy,
      maxScore: num(a.maxScore), passScore: num(a.passScore), answerVisibility: a.answerVisibility,
      aiGradingAllowed: a.aiGradingAllowed, aiFeedbackVisible: a.aiFeedbackVisible,
      publishedAt: a.publishedAt, revokedAt: a.revokedAt, phase: a.status === 'PUBLISHED' ? phaseOf(a) : null, hasSubmissions,
      targets: a.targets.map((t) => ({ id: t.id, type: t.targetType, classId: t.classId, studentId: t.studentId, label: t.class ? `${t.class.code} – ${t.class.name}` : t.student?.user.fullName ?? '' })),
      attachments: a.attachments.map((x) => fileView(x.file)),
      questions: a.questions.map((q) => ({
        id: q.id, ordinal: q.ordinal, type: q.type, content: q.content, points: num(q.points), isRequired: q.isRequired,
        config: q.config, referenceAnswer: q.referenceAnswer, explanation: q.explanation,
        options: q.options.map((o) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })),
        rubric: q.rubric ? { id: q.rubric.id, version: q.rubric.version, locked: !!q.rubric.lockedAt, criteria: q.rubric.criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, maxPoints: num(c.maxPoints) })) } : null,
        attachments: q.attachments.map((x) => fileView(x.file)),
      })),
    };
  }

  private async assertTeachesSubject(tx: Tx, subjectId: string) {
    const t = await tx.classTeacher.findFirst({ where: { teacherId: currentUser().id, subjectId, unassignedAt: null } });
    if (!t) throw unprocessable('SUBJECT_NOT_ASSIGNED', 'Bạn chưa được phân công giảng dạy môn này.');
  }

  private async linkFiles(tx: Tx, fileIds: string[] | undefined, allowedPurposes: string[]) {
    if (!fileIds?.length) return [];
    const files = await tx.fileObject.findMany({ where: { id: { in: fileIds }, uploadedBy: currentUser().id, status: 'ACTIVE' } });
    if (files.length !== new Set(fileIds).size || files.some((f) => !allowedPurposes.includes(f.purpose))) throw unprocessable('INVALID_FILE', 'Tệp đính kèm không hợp lệ.');
    return files;
  }

  private settings(dto: Partial<CreateAssignmentDto>) {
    return {
      description: dto.description, instructions: dto.instructions, topic: dto.topic,
      passScore: dto.passScore === undefined ? undefined : dto.passScore === null ? null : dec(dto.passScore),
      timeLimitMinutes: dto.timeLimitMinutes, allowResubmit: dto.allowResubmit, maxAttempts: dto.maxAttempts,
      answerVisibility: dto.answerVisibility, aiGradingAllowed: dto.aiGradingAllowed, aiFeedbackVisible: dto.aiFeedbackVisible,
    };
  }

  async create(dto: CreateAssignmentDto) {
    const me = currentUser().id;
    const id = await this.db.tenant(async (tx) => {
      await this.assertTeachesSubject(tx, dto.subjectId);
      const files = await this.linkFiles(tx, dto.attachmentFileIds, ['ASSIGNMENT_ATTACHMENT']);
      const a = await tx.assignment.create({
        data: { tenantId: currentTenantId(), subjectId: dto.subjectId, ownerTeacherId: me, createdBy: me, title: dto.title.trim(), ...this.settings(dto) },
      });
      if (files.length) await tx.assignmentAttachment.createMany({ data: files.map((f) => ({ tenantId: currentTenantId(), assignmentId: a.id, fileId: f.id })) });
      await this.audit.log(tx, { action: 'assignment.create', resourceType: 'assignment', resourceId: a.id, metadata: { title: a.title } });
      return a.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    const me = currentUser().id;
    await this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, id);
      if (a.status === 'ARCHIVED') throw conflict('ARCHIVED', 'Bài tập đã lưu trữ.');
      const hasSubs = (await tx.submissionVersion.count({ where: { submission: { assignmentId: id } } })) > 0;
      if (dto.subjectId && dto.subjectId !== a.subjectId) {
        if (a.status !== 'DRAFT') throw conflict('LOCKED_FIELD', 'Không thể đổi môn khi bài đã giao.');
        await this.assertTeachesSubject(tx, dto.subjectId);
      }
      if (hasSubs && dto.timeLimitMinutes !== undefined && dto.timeLimitMinutes !== a.timeLimitMinutes) {
        throw conflict('LOCKED_FIELD', 'Không thể đổi thời gian làm bài khi đã có bài nộp.');
      }
      const data: Prisma.AssignmentUncheckedUpdateInput = { title: dto.title?.trim(), subjectId: dto.subjectId, ...this.settings(dto), lockVersion: { increment: 1 } };
      if (dto.passScore !== undefined && dto.passScore !== null && dto.passScore > Number(a.maxScore) && a.status !== 'DRAFT') {
        throw badRequest('INVALID_PASS_SCORE', 'Điểm đạt không được lớn hơn tổng điểm.');
      }
      if (dto.dueAt !== undefined || dto.lateUntil !== undefined || dto.allowLate !== undefined) {
        if (a.status === 'DRAFT') throw badRequest('USE_PUBLISH', 'Đặt thời gian khi giao bài.');
        const dueAt = dto.dueAt ? new Date(dto.dueAt) : a.dueAt!;
        const allowLate = dto.allowLate ?? a.allowLate;
        const lateUntil = allowLate ? (dto.lateUntil === undefined ? a.lateUntil : dto.lateUntil ? new Date(dto.lateUntil) : null) : null;
        if (dueAt <= a.openAt!) throw badRequest('INVALID_DATES', 'Hạn nộp phải sau thời gian mở bài.');
        if (allowLate && (!lateUntil || lateUntil < dueAt)) throw badRequest('INVALID_DATES', 'Hạn nộp muộn phải sau hạn nộp.');
        Object.assign(data, { dueAt, allowLate, lateUntil, dueReminderSentAt: dueAt.getTime() !== a.dueAt?.getTime() ? null : undefined });
      }
      await tx.assignment.update({ where: { id }, data });
      if (dto.attachmentFileIds) {
        const files = await this.linkFiles(tx, dto.attachmentFileIds, ['ASSIGNMENT_ATTACHMENT']).catch(async (e) => {
          // Already-linked files (uploaded by a previous owner) remain allowed.
          const existing = await tx.assignmentAttachment.findMany({ where: { assignmentId: id } });
          if (dto.attachmentFileIds!.every((f) => existing.some((x) => x.fileId === f))) return [];
          throw e;
        });
        await tx.assignmentAttachment.deleteMany({ where: { assignmentId: id, fileId: { notIn: dto.attachmentFileIds } } });
        if (files.length) await tx.assignmentAttachment.createMany({ data: files.map((f) => ({ tenantId: currentTenantId(), assignmentId: id, fileId: f.id })), skipDuplicates: true });
      }
      await this.audit.log(tx, { action: 'assignment.update', resourceType: 'assignment', resourceId: id, metadata: { fields: Object.keys(dto) } });
    });
    return this.get(id);
  }

  remove(id: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, id);
      if (a.status !== 'DRAFT') throw conflict('NOT_DRAFT', 'Chỉ xóa được bài tập nháp. Hãy thu hồi hoặc lưu trữ bài đã giao.');
      await tx.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(tx, { action: 'assignment.delete', resourceType: 'assignment', resourceId: id });
      return { ok: true };
    });
  }

  // ── Questions ──

  private validateQuestion(dto: QuestionDto) {
    const options = dto.options ?? [];
    if (CHOICE.includes(dto.type)) {
      const p = answerKeyProblem({ type: dto.type, options, config: dto.config ?? {} });
      if (p) throw badRequest('INVALID_ANSWER_KEY', p);
    } else if (options.length) {
      throw badRequest('OPTIONS_NOT_ALLOWED', 'Loại câu hỏi này không có lựa chọn.');
    }
    if (dto.rubric?.criteria?.length) {
      if (!['ESSAY', 'SHORT_ANSWER', 'FILE_UPLOAD'].includes(dto.type)) throw badRequest('RUBRIC_NOT_ALLOWED', 'Rubric chỉ dùng cho câu tự luận, trả lời ngắn hoặc nộp file.');
      const total = Math.round(dto.rubric.criteria.reduce((s, c) => s + c.maxPoints, 0) * 100) / 100;
      if (total !== dto.points) throw badRequest('RUBRIC_TOTAL', `Tổng điểm các tiêu chí (${total}) phải bằng điểm của câu (${dto.points}).`);
    }
  }

  private async recomputeMaxScore(tx: Tx, assignmentId: string) {
    const agg = await tx.question.aggregate({ where: { assignmentId, deletedAt: null }, _sum: { points: true } });
    await tx.assignment.update({ where: { id: assignmentId }, data: { maxScore: agg._sum.points ?? dec(0) } });
  }

  private async writeRubric(tx: Tx, questionId: string | null, existingRubricId: string | null, dto: QuestionDto): Promise<string | null | undefined> {
    if (dto.rubric === undefined) return undefined;
    if (dto.rubric === null || !dto.rubric.criteria.length) return null;
    const tenantId = currentTenantId();
    const existing = existingRubricId ? await tx.rubric.findUnique({ where: { id: existingRubricId } }) : null;
    let rubricId: string;
    if (existing && !existing.lockedAt) {
      await tx.rubricCriterion.deleteMany({ where: { rubricId: existing.id } });
      rubricId = existing.id;
    } else {
      // Locked rubrics (already used for grading) are immutable: create a new version (E30).
      const r = await tx.rubric.create({
        data: { tenantId, ownerTeacherId: currentUser().id, name: `Rubric câu hỏi`, version: (existing?.version ?? 0) + 1, previousVersionId: existing?.id },
      });
      rubricId = r.id;
    }
    await tx.rubricCriterion.createMany({
      data: dto.rubric.criteria.map((c, i) => ({ tenantId, rubricId, ordinal: i + 1, name: c.name.trim(), description: c.description?.trim() || null, maxPoints: dec(c.maxPoints) })),
    });
    void questionId;
    return rubricId;
  }

  async addQuestion(assignmentId: string, dto: QuestionDto) {
    const me = currentUser().id;
    this.validateQuestion(dto);
    await this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, assignmentId);
      if (!['DRAFT', 'SCHEDULED'].includes(a.status)) {
        const hasSubs = await tx.submissionVersion.count({ where: { submission: { assignmentId } } });
        if (hasSubs || a.status !== 'PUBLISHED') throw conflict('QUESTIONS_LOCKED', 'Không thể thêm câu hỏi khi đã có bài nộp.');
      }
      const files = await this.linkFiles(tx, dto.attachmentFileIds, ['QUESTION_MEDIA']);
      const last = await tx.question.aggregate({ where: { assignmentId, deletedAt: null }, _max: { ordinal: true } });
      const rubricId = await this.writeRubric(tx, null, null, dto);
      const tenantId = currentTenantId();
      const q = await tx.question.create({
        data: {
          tenantId, assignmentId, ordinal: (last._max.ordinal ?? 0) + 1, type: dto.type, content: dto.content.trim(), points: dec(dto.points),
          isRequired: dto.isRequired ?? true, config: sanitizeConfig(dto.type, dto.config as any), referenceAnswer: dto.referenceAnswer ?? null,
          explanation: dto.explanation ?? null, rubricId: rubricId ?? null,
          options: { create: (dto.options ?? []).map((o, i) => ({ tenantId, ordinal: i + 1, content: o.content.trim(), isCorrect: o.isCorrect })) },
        },
      });
      if (files.length) await tx.questionAttachment.createMany({ data: files.map((f) => ({ tenantId, questionId: q.id, fileId: f.id })) });
      await this.recomputeMaxScore(tx, assignmentId);
      await this.audit.log(tx, { action: 'question.create', resourceType: 'question', resourceId: q.id });
    });
    return this.get(assignmentId);
  }

  async updateQuestion(questionId: string, dto: QuestionDto) {
    const me = currentUser().id;
    this.validateQuestion(dto);
    const assignmentId = await this.db.tenant(async (tx) => {
      const q = await tx.question.findUnique({ where: { id: questionId }, include: { options: { orderBy: { ordinal: 'asc' } }, attachments: true } });
      if (!q || q.deletedAt) throw notFound();
      const a = await this.scope.ownAssignment(tx, me, q.assignmentId);
      if (a.status === 'ARCHIVED') throw conflict('ARCHIVED', 'Bài tập đã lưu trữ.');
      const hasSubs = (await tx.submissionVersion.count({ where: { submission: { assignmentId: a.id } } })) > 0;
      const tenantId = currentTenantId();
      let keyChanged = false;
      if (hasSubs) {
        // BR-13: structure is frozen once students have submitted.
        if (dto.type !== q.type) throw conflict('QUESTIONS_LOCKED', 'Không thể đổi loại câu hỏi khi đã có bài nộp.');
        if (dto.points !== Number(q.points)) throw conflict('QUESTIONS_LOCKED', 'Không thể đổi điểm câu hỏi khi đã có bài nộp.');
        const opts = dto.options ?? [];
        if (opts.length !== q.options.length || opts.some((o) => !o.id || !q.options.some((x) => x.id === o.id))) {
          throw conflict('QUESTIONS_LOCKED', 'Không thể thêm/xóa lựa chọn khi đã có bài nộp.');
        }
        for (const o of opts) {
          const old = q.options.find((x) => x.id === o.id)!;
          if (old.isCorrect !== o.isCorrect) keyChanged = true;
          await tx.questionOption.update({ where: { id: o.id }, data: { content: o.content.trim(), isCorrect: o.isCorrect } });
        }
        const newCfg = sanitizeConfig(dto.type, dto.config as any);
        if (JSON.stringify(newCfg) !== JSON.stringify(q.config)) keyChanged = true;
        await tx.question.update({
          where: { id: q.id },
          data: { content: dto.content.trim(), config: newCfg, referenceAnswer: dto.referenceAnswer ?? null, explanation: dto.explanation ?? null, isRequired: dto.isRequired ?? q.isRequired, lockVersion: { increment: 1 } },
        });
        const rubricId = await this.writeRubric(tx, q.id, q.rubricId, dto);
        if (rubricId !== undefined) await tx.question.update({ where: { id: q.id }, data: { rubricId } });
      } else {
        const rubricId = await this.writeRubric(tx, q.id, q.rubricId, dto);
        await tx.questionOption.deleteMany({ where: { questionId: q.id } });
        await tx.question.update({
          where: { id: q.id },
          data: {
            type: dto.type, content: dto.content.trim(), points: dec(dto.points), isRequired: dto.isRequired ?? true,
            config: sanitizeConfig(dto.type, dto.config as any), referenceAnswer: dto.referenceAnswer ?? null, explanation: dto.explanation ?? null,
            ...(rubricId !== undefined ? { rubricId } : {}), lockVersion: { increment: 1 },
            options: { create: (dto.options ?? []).map((o, i) => ({ tenantId, ordinal: i + 1, content: o.content.trim(), isCorrect: o.isCorrect })) },
          },
        });
      }
      if (dto.attachmentFileIds) {
        const keep = q.attachments.filter((x) => dto.attachmentFileIds!.includes(x.fileId)).map((x) => x.fileId);
        const fresh = dto.attachmentFileIds.filter((f) => !keep.includes(f));
        const files = await this.linkFiles(tx, fresh, ['QUESTION_MEDIA']);
        await tx.questionAttachment.deleteMany({ where: { questionId: q.id, fileId: { notIn: dto.attachmentFileIds } } });
        if (files.length) await tx.questionAttachment.createMany({ data: files.map((f) => ({ tenantId, questionId: q.id, fileId: f.id })) });
      }
      await this.recomputeMaxScore(tx, a.id);
      let regraded = 0;
      if (keyChanged) regraded = await this.grading.regradeQuestion(tx, { tenantId, questionId: q.id, assignmentTitle: a.title });
      await this.audit.log(tx, { action: 'question.update', resourceType: 'question', resourceId: q.id, metadata: { keyChanged, regraded } });
      return a.id;
    });
    return this.get(assignmentId);
  }

  async deleteQuestion(questionId: string) {
    const me = currentUser().id;
    const assignmentId = await this.db.tenant(async (tx) => {
      const q = await tx.question.findUnique({ where: { id: questionId } });
      if (!q || q.deletedAt) throw notFound();
      const a = await this.scope.ownAssignment(tx, me, q.assignmentId);
      const hasSubs = await tx.submissionVersion.count({ where: { submission: { assignmentId: a.id } } });
      if (hasSubs) throw conflict('QUESTIONS_LOCKED', 'Không thể xóa câu hỏi khi đã có bài nộp.');
      await tx.question.update({ where: { id: q.id }, data: { deletedAt: new Date(), ordinal: -Math.abs(q.ordinal) - 100000 } });
      const rest = await tx.question.findMany({ where: { assignmentId: a.id, deletedAt: null }, orderBy: { ordinal: 'asc' } });
      for (const [i, r] of rest.entries()) if (r.ordinal !== i + 1) await tx.question.update({ where: { id: r.id }, data: { ordinal: i + 1 } });
      await this.recomputeMaxScore(tx, a.id);
      await this.audit.log(tx, { action: 'question.delete', resourceType: 'question', resourceId: q.id });
      return a.id;
    });
    return this.get(assignmentId);
  }

  async reorder(assignmentId: string, dto: ReorderDto) {
    const me = currentUser().id;
    await this.db.tenant(async (tx) => {
      await this.scope.ownAssignment(tx, me, assignmentId);
      const qs = await tx.question.findMany({ where: { assignmentId, deletedAt: null } });
      if (qs.length !== dto.questionIds.length || qs.some((q) => !dto.questionIds.includes(q.id))) throw badRequest('INVALID_ORDER', 'Danh sách câu hỏi không khớp.');
      for (const [i, id] of dto.questionIds.entries()) await tx.question.update({ where: { id }, data: { ordinal: i + 1 } });
      await this.audit.log(tx, { action: 'question.reorder', resourceType: 'assignment', resourceId: assignmentId });
    });
    return this.get(assignmentId);
  }

  // ── Lifecycle ──

  async publish(id: string, dto: PublishDto) {
    const me = currentUser().id;
    await this.db.tenant(async (tx) => {
      const a = await tx.assignment.findFirst({ where: { id, ownerTeacherId: me, deletedAt: null }, include: { questions: { where: { deletedAt: null }, include: { options: true } } } });
      if (!a) throw notFound('Không tìm thấy bài tập.');
      if (!['DRAFT', 'SCHEDULED', 'PUBLISHED'].includes(a.status)) throw conflict('INVALID_STATE', 'Bài tập không ở trạng thái có thể giao.');
      const problems: string[] = [];
      if (!a.questions.length) problems.push('Bài tập chưa có câu hỏi.');
      a.questions.forEach((q, i) => {
        const p = answerKeyProblem({ type: q.type, options: q.options, config: (q.config ?? {}) as any });
        if (p) problems.push(`Câu ${i + 1}: ${p}`);
      });
      if (Number(a.maxScore) <= 0) problems.push('Tổng điểm phải lớn hơn 0.');
      if (a.passScore !== null && Number(a.passScore) > Number(a.maxScore)) problems.push('Điểm đạt lớn hơn tổng điểm.');
      const now = new Date();
      const openAt = a.status === 'PUBLISHED' ? a.openAt! : dto.openAt ? new Date(dto.openAt) : now;
      const dueAt = new Date(dto.dueAt);
      const allowLate = !!dto.allowLate;
      const lateUntil = allowLate && dto.lateUntil ? new Date(dto.lateUntil) : null;
      if (dueAt <= openAt) problems.push('Hạn nộp phải sau thời gian mở bài.');
      if (dueAt <= now) problems.push('Hạn nộp phải ở tương lai.');
      if (allowLate && (!lateUntil || lateUntil < dueAt)) problems.push('Hạn nộp muộn phải sau hạn nộp.');
      if (!dto.classIds.length && !dto.studentIds.length) problems.push('Chọn ít nhất một lớp hoặc học sinh nhận bài.');

      const teaching = await tx.classTeacher.findMany({ where: { teacherId: me, subjectId: a.subjectId, unassignedAt: null, class: { archivedAt: null } } });
      const allowedClasses = new Set(teaching.map((t) => t.classId));
      if (dto.classIds.some((c) => !allowedClasses.has(c))) problems.push('Có lớp bạn không được phân công dạy môn này.');
      if (dto.studentIds.length) {
        const ok = await tx.classStudent.findMany({ where: { studentId: { in: dto.studentIds }, leftAt: null, classId: { in: [...allowedClasses] } }, select: { studentId: true } });
        const okSet = new Set(ok.map((o) => o.studentId));
        if (dto.studentIds.some((s) => !okSet.has(s))) problems.push('Có học sinh không thuộc lớp bạn dạy môn này.');
      }
      if (problems.length) throw unprocessable('PUBLISH_INVALID', problems[0], problems);

      const tenantId = currentTenantId();
      const existing = await tx.assignmentTarget.findMany({ where: { assignmentId: id } });
      const hasSubs = (await tx.submissionVersion.count({ where: { submission: { assignmentId: id } } })) > 0;
      if (a.status !== 'PUBLISHED' || !hasSubs) {
        await tx.assignmentTarget.deleteMany({ where: { assignmentId: id, id: { notIn: [] } } });
      }
      const keep = a.status === 'PUBLISHED' && hasSubs ? existing : [];
      const targets = [
        ...dto.classIds.filter((c) => !keep.some((k) => k.classId === c)).map((classId) => ({ tenantId, assignmentId: id, targetType: 'CLASS' as const, classId })),
        ...dto.studentIds.filter((s) => !keep.some((k) => k.studentId === s)).map((studentId) => ({ tenantId, assignmentId: id, targetType: 'STUDENT' as const, studentId })),
      ];
      if (targets.length) await tx.assignmentTarget.createMany({ data: targets });
      const goLive = openAt <= now;
      await tx.assignment.update({
        where: { id },
        data: {
          status: goLive ? 'PUBLISHED' : 'SCHEDULED', openAt, dueAt, allowLate, lateUntil,
          publishedAt: goLive ? (a.publishedAt ?? now) : null, revokedAt: null, lockVersion: { increment: 1 },
          dueReminderSentAt: a.dueAt?.getTime() === dueAt.getTime() ? undefined : null,
        },
      });
      if (goLive) await this.notifyPublished(tx, id, a.title);
      await this.audit.log(tx, { action: 'assignment.publish', resourceType: 'assignment', resourceId: id, metadata: { openAt, dueAt, classIds: dto.classIds, studentIds: dto.studentIds, scheduled: !goLive } });
    });
    return this.get(id);
  }

  async notifyPublished(tx: Tx, assignmentId: string, title: string) {
    const recipients = await this.scope.recipients(tx, assignmentId);
    await this.notify.send(tx, currentTenantId(), recipients, {
      type: 'ASSIGNMENT_PUBLISHED', title: `Bài tập mới: ${title}`, link: `/student/assignments/${assignmentId}`,
      dedupe: (u) => `asg-pub:${assignmentId}:${u}`,
    });
    return recipients.length;
  }

  async setState(id: string, action: 'revoke' | 'restore' | 'archive') {
    const me = currentUser().id;
    await this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, id);
      const now = new Date();
      if (action === 'revoke') {
        if (!['PUBLISHED', 'SCHEDULED'].includes(a.status)) throw conflict('INVALID_STATE', 'Chỉ thu hồi được bài đang giao hoặc đã lên lịch.');
        await tx.assignment.update({ where: { id }, data: { status: 'REVOKED', revokedAt: now } });
      } else if (action === 'restore') {
        if (a.status !== 'REVOKED') throw conflict('INVALID_STATE', 'Bài tập không ở trạng thái đã thu hồi.');
        const live = a.openAt! <= now;
        await tx.assignment.update({ where: { id }, data: { status: live ? 'PUBLISHED' : 'SCHEDULED', revokedAt: null, publishedAt: live ? (a.publishedAt ?? now) : null } });
        if (live) await this.notifyPublished(tx, id, a.title);
      } else {
        const closed = a.status === 'REVOKED' || (a.status === 'PUBLISHED' && phaseOf(a, now) === 'CLOSED');
        if (!closed) throw conflict('INVALID_STATE', 'Chỉ lưu trữ được bài đã hết hạn nộp hoặc đã thu hồi.');
        await tx.assignment.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: now } });
      }
      await this.audit.log(tx, { action: `assignment.${action}`, resourceType: 'assignment', resourceId: id });
    });
    return this.get(id);
  }

  async duplicate(id: string) {
    const me = currentUser().id;
    const newId = await this.db.tenant(async (tx) => {
      await this.scope.ownAssignment(tx, me, id);
      const a = await tx.assignment.findUniqueOrThrow({ where: { id }, include: fullInclude });
      await this.assertTeachesSubject(tx, a.subjectId);
      const tenantId = currentTenantId();
      const copy = await tx.assignment.create({
        data: {
          tenantId, subjectId: a.subjectId, ownerTeacherId: me, createdBy: me, title: `${a.title} (bản sao)`.slice(0, 200),
          description: a.description, instructions: a.instructions, topic: a.topic, passScore: a.passScore, timeLimitMinutes: a.timeLimitMinutes,
          allowResubmit: a.allowResubmit, maxAttempts: a.maxAttempts, answerVisibility: a.answerVisibility, aiGradingAllowed: a.aiGradingAllowed,
          aiFeedbackVisible: a.aiFeedbackVisible, maxScore: a.maxScore,
        },
      });
      if (a.attachments.length) await tx.assignmentAttachment.createMany({ data: a.attachments.map((x) => ({ tenantId, assignmentId: copy.id, fileId: x.fileId })) });
      for (const q of a.questions) {
        let rubricId: string | null = null;
        if (q.rubric) {
          const r = await tx.rubric.create({ data: { tenantId, ownerTeacherId: me, name: q.rubric.name } });
          await tx.rubricCriterion.createMany({ data: q.rubric.criteria.map((c) => ({ tenantId, rubricId: r.id, ordinal: c.ordinal, name: c.name, description: c.description, maxPoints: c.maxPoints })) });
          rubricId = r.id;
        }
        const nq = await tx.question.create({
          data: {
            tenantId, assignmentId: copy.id, ordinal: q.ordinal, type: q.type, content: q.content, points: q.points, isRequired: q.isRequired,
            config: q.config as Prisma.InputJsonValue, referenceAnswer: q.referenceAnswer, explanation: q.explanation, rubricId, sourceQuestionId: q.id,
            options: { create: q.options.map((o) => ({ tenantId, ordinal: o.ordinal, content: o.content, isCorrect: o.isCorrect })) },
          },
        });
        if (q.attachments.length) await tx.questionAttachment.createMany({ data: q.attachments.map((x) => ({ tenantId, questionId: nq.id, fileId: x.fileId })) });
      }
      await this.audit.log(tx, { action: 'assignment.duplicate', resourceType: 'assignment', resourceId: copy.id, metadata: { sourceId: id } });
      return copy.id;
    });
    return this.get(newId);
  }

  /** Per-student tracking (GRD-01): status per business-workflows §4.2. */
  roster(id: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const a = await this.scope.ownAssignment(tx, me, id);
      const recipients = await this.scope.recipients(tx, id);
      const [students, subs] = await Promise.all([
        tx.student.findMany({ where: { userId: { in: recipients } }, include: { user: { select: { fullName: true } }, enrollments: { where: { leftAt: null }, include: { class: { select: { code: true } } } } } }),
        tx.submission.findMany({ where: { assignmentId: id }, include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 }, grades: { orderBy: { createdAt: 'desc' } } } }),
      ]);
      const now = new Date();
      const closed = a.status !== 'DRAFT' && phaseOf(a, now) === 'CLOSED';
      const byStudent = new Map(subs.map((s) => [s.studentId, s]));
      const rows = students.map((st) => {
        const s = byStudent.get(st.userId);
        const latestGrade = s?.grades.find((g) => g.submissionVersionId === s.latestVersionId);
        const effective = s?.grades.find((g) => g.id === s.effectiveGradeId);
        let status: string = s ? s.status : 'NOT_STARTED';
        if ((!s || (s.status === 'IN_PROGRESS' && !s.latestVersionId)) && closed) status = 'MISSING';
        return {
          studentId: st.userId, studentCode: st.studentCode, fullName: st.user.fullName, classes: st.enrollments.map((e) => e.class.code),
          submissionId: s?.id ?? null, status, isLate: s?.versions[0]?.isLate ?? false, submittedAt: s?.versions[0]?.submittedAt ?? null,
          attempts: s?.attemptCount ?? 0, versionNo: s?.versions[0]?.versionNo ?? null,
          gradeId: latestGrade?.id ?? null, earnedScore: num(latestGrade?.earnedScore), publishedScore: num(effective?.earnedScore),
        };
      }).sort((x, y) => x.studentCode.localeCompare(y.studentCode));
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return {
        assignment: { id: a.id, title: a.title, status: a.status, dueAt: a.dueAt, closeAt: closeAt(a), maxScore: num(a.maxScore), phase: a.status === 'PUBLISHED' ? phaseOf(a, now) : null },
        counts, late: rows.filter((r) => r.isLate).length, rows,
      };
    });
  }
}
