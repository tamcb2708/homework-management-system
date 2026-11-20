import { Injectable } from '@nestjs/common';
import { GradeChangeType, Prisma } from '@prisma/client';
import { Tx } from '../prisma/db.service';
import { NotifyService } from '../notifications/notify.service';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { maybeCtx } from '../common/context';
import { dec, isMultipleOf, num } from '../common/util';
import { Answer, gradeAuto, QType, totalIfComplete } from './engine';

type QuestionWithOptions = Prisma.QuestionGetPayload<{ include: { options: true } }>;

export interface ScoreInput {
  score?: number;
  feedback?: string | null;
  isMarkedWrong?: boolean;
  criteria?: { criterionId: string; score: number; feedback?: string | null }[];
  reason?: string;
}

/**
 * Single entry point for every score change (D7.3, BR-35): each mutation writes grade_history in the same transaction.
 * AI suggestions are never written here as official scores (D9.2).
 */
@Injectable()
export class GradingService {
  constructor(private readonly notify: NotifyService, private readonly audit: AuditService) {}

  private actor() {
    const c = maybeCtx();
    return c?.user ? { actorType: 'USER' as const, changedBy: c.user.id } : { actorType: 'SYSTEM' as const, changedBy: null };
  }

  /** Creates the grade for a freshly submitted version and auto-grades deterministic questions. */
  async createForVersion(tx: Tx, p: {
    tenantId: string; submissionId: string; versionId: string;
    assignment: { maxScore: Prisma.Decimal; passScore: Prisma.Decimal | null };
    questions: QuestionWithOptions[]; answers: Record<string, Answer>;
  }) {
    const grade = await tx.grade.create({
      data: { tenantId: p.tenantId, submissionId: p.submissionId, submissionVersionId: p.versionId, maxScore: p.assignment.maxScore, passScore: p.assignment.passScore },
    });
    let allAuto = true;
    for (const q of p.questions) {
      const r = gradeAuto({ type: q.type as QType, points: Number(q.points), config: (q.config ?? {}) as any, options: q.options }, p.answers[q.id]);
      if (r.status === 'AUTO_GRADED') {
        const d = await tx.gradeDetail.create({
          data: { tenantId: p.tenantId, gradeId: grade.id, questionId: q.id, status: 'AUTO_GRADED', source: 'AUTO', maxScore: q.points, earnedScore: dec(r.score), isMarkedWrong: r.score < Number(q.points) },
        });
        await tx.gradeHistory.create({ data: { tenantId: p.tenantId, gradeId: grade.id, gradeDetailId: d.id, changeType: 'AUTO_GRADED', newScore: dec(r.score), actorType: 'SYSTEM' } });
      } else {
        allAuto = false;
        await tx.gradeDetail.create({ data: { tenantId: p.tenantId, gradeId: grade.id, questionId: q.id, status: 'NEEDS_MANUAL', maxScore: q.points } });
      }
    }
    await this.recompute(tx, grade.id);
    return { gradeId: grade.id, allAuto };
  }

  /** Recomputes totals and moves grade/submission state machines (business-workflows §4–5). */
  async recompute(tx: Tx, gradeId: string) {
    const g = await tx.grade.findUniqueOrThrow({ where: { id: gradeId }, include: { details: true, submission: true } });
    const total = totalIfComplete(g.details.map((d) => ({ earnedScore: num(d.earnedScore) })));
    const isLatest = g.submission.latestVersionId === g.submissionVersionId;
    if (total === null) {
      const anyTeacherWork = g.details.some((d) => d.source === 'TEACHER' || d.status === 'AI_PENDING' || d.status === 'AI_SUGGESTED');
      await tx.grade.update({ where: { id: g.id }, data: { earnedScore: null, passed: null, status: g.status === 'PUBLISHED' ? 'PUBLISHED' : 'IN_PROGRESS' } });
      if (isLatest && ['SUBMITTED', 'GRADING', 'GRADED'].includes(g.submission.status)) {
        await tx.submission.update({ where: { id: g.submissionId }, data: { status: anyTeacherWork ? 'GRADING' : 'SUBMITTED' } });
      }
      return;
    }
    const passed = g.passScore === null ? null : total >= Number(g.passScore);
    const status = g.status === 'PUBLISHED' ? 'PUBLISHED' : 'GRADED';
    await tx.grade.update({
      where: { id: g.id },
      data: { earnedScore: dec(total), passed, status, gradedAt: g.gradedAt ?? new Date(), gradedBy: g.gradedBy ?? maybeCtx()?.user?.id ?? null },
    });
    if (isLatest && ['SUBMITTED', 'GRADING'].includes(g.submission.status)) {
      await tx.submission.update({ where: { id: g.submissionId }, data: { status: 'GRADED' } });
    }
  }

  /** Teacher sets/edits the official score of one question (manual or rubric grading). */
  async setScore(tx: Tx, p: { tenantId: string; detailId: string; input: ScoreInput; scoreStep: number; studentId: string; assignmentTitle: string; link: string }) {
    const d = await tx.gradeDetail.findUnique({
      where: { id: p.detailId },
      include: { grade: true, question: { include: { rubric: { include: { criteria: { orderBy: { ordinal: 'asc' } } } } } }, criteria: true },
    });
    if (!d) throw notFound();
    if (d.status === 'AI_PENDING') throw conflict('AI_PENDING', 'Câu này đang được AI chấm, vui lòng đợi.');
    const published = d.grade.status === 'PUBLISHED';
    const max = Number(d.maxScore);
    const step = p.scoreStep;
    const checkScore = (v: number, m: number, label: string) => {
      if (!(v >= 0 && v <= m)) throw badRequest('SCORE_OUT_OF_RANGE', `${label} phải trong khoảng 0–${m}.`);
      if (!isMultipleOf(v, step)) throw badRequest('SCORE_STEP', `${label} phải là bội số của ${step}.`);
    };

    let score: number;
    const rubric = d.question.rubric;
    if (rubric && p.input.criteria) {
      const byId = new Map(rubric.criteria.map((c) => [c.id, c]));
      if (p.input.criteria.length !== rubric.criteria.length || p.input.criteria.some((c) => !byId.has(c.criterionId))) {
        throw badRequest('RUBRIC_INCOMPLETE', 'Cần chấm đủ tất cả tiêu chí của rubric.');
      }
      for (const c of p.input.criteria) checkScore(c.score, Number(byId.get(c.criterionId)!.maxPoints), `Điểm tiêu chí "${byId.get(c.criterionId)!.name}"`);
      score = Math.round(p.input.criteria.reduce((s, c) => s + c.score, 0) * 100) / 100;
      await tx.gradeDetailCriterion.deleteMany({ where: { gradeDetailId: d.id } });
      await tx.gradeDetailCriterion.createMany({
        data: p.input.criteria.map((c) => ({
          tenantId: p.tenantId, gradeDetailId: d.id, rubricCriterionId: c.criterionId, maxScore: byId.get(c.criterionId)!.maxPoints, earnedScore: dec(c.score), feedback: c.feedback?.slice(0, 2000) ?? null,
        })),
      });
      if (!rubric.lockedAt) await tx.rubric.update({ where: { id: rubric.id }, data: { lockedAt: new Date() } });
    } else {
      if (p.input.score === undefined) throw badRequest('SCORE_REQUIRED', 'Vui lòng nhập điểm.');
      checkScore(p.input.score, max, 'Điểm');
      score = p.input.score;
    }
    const wasAuto = d.source === 'AUTO';
    const reason = p.input.reason?.trim();
    if ((published || wasAuto) && Number(d.earnedScore ?? -1) !== score && !reason) {
      throw badRequest('REASON_REQUIRED', published ? 'Điểm đã công bố – vui lòng nhập lý do sửa điểm.' : 'Vui lòng nhập lý do khi sửa điểm chấm tự động.');
    }
    let changeType: GradeChangeType = wasAuto ? 'OVERRIDE_AUTO' : 'MANUAL_SET';
    if (d.status === 'AI_SUGGESTED' && d.acceptedAiResultId) changeType = 'AI_MODIFIED';
    const actor = this.actor();
    await tx.gradeDetail.update({
      where: { id: d.id },
      data: {
        status: 'FINAL', source: 'TEACHER', earnedScore: dec(score),
        feedback: p.input.feedback === undefined ? undefined : p.input.feedback?.slice(0, 5000) || null,
        isMarkedWrong: p.input.isMarkedWrong ?? score < max,
        finalizedBy: actor.changedBy, finalizedAt: new Date(), lockVersion: { increment: 1 },
      },
    });
    if (Number(d.earnedScore ?? -1) !== score || (p.input.feedback !== undefined && (p.input.feedback || null) !== d.feedback)) {
      await tx.gradeHistory.create({
        data: {
          tenantId: p.tenantId, gradeId: d.gradeId, gradeDetailId: d.id, changeType,
          oldScore: d.earnedScore, newScore: dec(score), oldFeedback: d.feedback, newFeedback: p.input.feedback ?? d.feedback,
          reason: reason || null, ...actor,
        },
      });
    }
    await this.recompute(tx, d.gradeId);
    if (published) {
      await this.refreshEffective(tx, d.grade.submissionId);
      await this.notify.send(tx, p.tenantId, [p.studentId], { type: 'GRADE_UPDATED', title: `Điểm bài "${p.assignmentTitle}" đã được cập nhật`, link: p.link });
    }
    await this.audit.log(tx, { action: 'grade.update', resourceType: 'grade_detail', resourceId: d.id, metadata: { old: num(d.earnedScore), new: score, published, reason } });
  }

  async setOverallFeedback(tx: Tx, p: { tenantId: string; gradeId: string; teacherFeedback?: string | null; aiFeedbackApproved?: string | null }) {
    const g = await tx.grade.findUnique({ where: { id: p.gradeId } });
    if (!g) throw notFound();
    const data: Prisma.GradeUpdateInput = {};
    if (p.teacherFeedback !== undefined) data.teacherFeedback = p.teacherFeedback?.slice(0, 5000) || null;
    if (p.aiFeedbackApproved !== undefined) data.aiFeedbackApproved = p.aiFeedbackApproved?.slice(0, 5000) || null;
    await tx.grade.update({ where: { id: g.id }, data });
    await tx.gradeHistory.create({
      data: { tenantId: p.tenantId, gradeId: g.id, changeType: 'FEEDBACK_EDITED', oldFeedback: g.teacherFeedback, newFeedback: p.teacherFeedback ?? g.teacherFeedback, ...this.actor() },
    });
  }

  /** Publishes GRADED grades of latest versions (BR-34). Returns ids published and skipped with reasons. */
  async publish(tx: Tx, p: { tenantId: string; gradeIds: string[]; link: (submissionId: string) => string }) {
    const published: string[] = [];
    const skipped: { gradeId: string; reason: string }[] = [];
    for (const id of p.gradeIds) {
      const g = await tx.grade.findUnique({ where: { id }, include: { details: true, submission: { include: { assignment: true } } } });
      if (!g) { skipped.push({ gradeId: id, reason: 'Không tìm thấy' }); continue; }
      if (g.submission.latestVersionId !== g.submissionVersionId) { skipped.push({ gradeId: id, reason: 'Học sinh đã nộp phiên bản mới hơn' }); continue; }
      if (g.status === 'PUBLISHED') { skipped.push({ gradeId: id, reason: 'Đã công bố' }); continue; }
      if (g.status !== 'GRADED' || g.details.some((d) => !['AUTO_GRADED', 'FINAL'].includes(d.status))) {
        skipped.push({ gradeId: id, reason: 'Còn câu chưa chấm xong' }); continue;
      }
      const now = new Date();
      await tx.grade.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: now, publishedBy: maybeCtx()?.user?.id ?? null } });
      await tx.gradeHistory.create({ data: { tenantId: p.tenantId, gradeId: id, changeType: 'PUBLISHED', newScore: g.earnedScore, ...this.actor() } });
      if (['SUBMITTED', 'GRADING', 'GRADED'].includes(g.submission.status)) {
        await tx.submission.update({ where: { id: g.submissionId }, data: { status: 'PUBLISHED' } });
      }
      await this.refreshEffective(tx, g.submissionId);
      await this.notify.send(tx, p.tenantId, [g.submission.studentId], {
        type: 'GRADE_PUBLISHED', title: `Đã có điểm bài "${g.submission.assignment.title}"`,
        body: `Điểm: ${num(g.earnedScore)}/${num(g.maxScore)}`, link: p.link(g.submissionId), dedupe: (u) => `grade-pub:${id}:${u}`,
      });
      await this.audit.log(tx, { action: 'grade.publish', resourceType: 'grade', resourceId: id });
      published.push(id);
    }
    return { published, skipped };
  }

  /** Effective grade per grading policy: LATEST published version (D6.1); HIGHEST reserved (D6.4). */
  async refreshEffective(tx: Tx, submissionId: string) {
    const s = await tx.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: true } });
    const pub = await tx.grade.findMany({ where: { submissionId, status: 'PUBLISHED' }, include: { version: true } });
    if (!pub.length) return;
    const pick = s.assignment.gradingPolicy === 'HIGHEST'
      ? pub.reduce((a, b) => (Number(b.earnedScore) > Number(a.earnedScore) ? b : a))
      : pub.reduce((a, b) => (b.version.versionNo > a.version.versionNo ? b : a));
    await tx.submission.update({ where: { id: submissionId }, data: { effectiveGradeId: pick.id } });
  }

  /** WF-07: answer key changed → re-run the rule engine on every AUTO_GRADED detail of that question. */
  async regradeQuestion(tx: Tx, p: { tenantId: string; questionId: string; assignmentTitle: string }) {
    const q = await tx.question.findUniqueOrThrow({ where: { id: p.questionId }, include: { options: true } });
    const details = await tx.gradeDetail.findMany({
      where: { questionId: q.id, source: 'AUTO' },
      include: { grade: { include: { submission: true, version: { include: { answers: { where: { questionId: q.id } } } } } } },
    });
    let changed = 0;
    for (const d of details) {
      const ans = (d.grade.version.answers[0]?.answer ?? undefined) as Answer | undefined;
      const r = gradeAuto({ type: q.type as QType, points: Number(q.points), config: (q.config ?? {}) as any, options: q.options }, ans);
      if (r.status !== 'AUTO_GRADED' || Number(d.earnedScore) === r.score) continue;
      await tx.gradeDetail.update({ where: { id: d.id }, data: { earnedScore: dec(r.score), isMarkedWrong: r.score < Number(q.points) } });
      await tx.gradeHistory.create({
        data: { tenantId: p.tenantId, gradeId: d.gradeId, gradeDetailId: d.id, changeType: 'REGRADE_KEY_CHANGE', oldScore: d.earnedScore, newScore: dec(r.score), reason: 'Cập nhật đáp án', ...this.actor() },
      });
      await this.recompute(tx, d.gradeId);
      if (d.grade.status === 'PUBLISHED') {
        await this.refreshEffective(tx, d.grade.submissionId);
        await this.notify.send(tx, p.tenantId, [d.grade.submission.studentId], { type: 'GRADE_UPDATED', title: `Điểm bài "${p.assignmentTitle}" được cập nhật do sửa đáp án` });
      }
      changed++;
    }
    return changed;
  }
}
