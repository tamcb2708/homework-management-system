import { Injectable } from '@nestjs/common';
import type { Tx } from '../prisma/db.service';
import { notFound } from '../common/errors';

/**
 * Scope rules (docs/authentication-authorization.md §6). Teacher scope is computed from the CURRENT
 * class_teachers rows on every request, so removing an assignment revokes access immediately (BR-03).
 */
@Injectable()
export class ScopeService {
  async teaching(tx: Tx, teacherId: string) {
    return tx.classTeacher.findMany({
      where: { teacherId, unassignedAt: null, class: { archivedAt: null } },
      select: { classId: true, subjectId: true },
    });
  }

  async teacherClassIds(tx: Tx, teacherId: string): Promise<string[]> {
    return [...new Set((await this.teaching(tx, teacherId)).map((t) => t.classId))];
  }

  async assertTeacherTeachesClass(tx: Tx, teacherId: string, classId: string) {
    const ok = await tx.classTeacher.findFirst({ where: { teacherId, classId, unassignedAt: null }, select: { id: true } });
    if (!ok) throw notFound();
  }

  /** Teacher teaches `subjectId` in a class where the student is currently enrolled. */
  async teacherSeesStudentInSubject(tx: Tx, teacherId: string, studentId: string, subjectId: string): Promise<boolean> {
    const row = await tx.classTeacher.findFirst({
      where: { teacherId, subjectId, unassignedAt: null, class: { students: { some: { studentId, leftAt: null } } } },
      select: { id: true },
    });
    return !!row;
  }

  async studentActiveClassIds(tx: Tx, studentId: string): Promise<string[]> {
    const rows = await tx.classStudent.findMany({ where: { studentId, leftAt: null, class: { archivedAt: null } }, select: { classId: true } });
    return rows.map((r) => r.classId);
  }

  async ownAssignment(tx: Tx, teacherId: string, assignmentId: string) {
    const a = await tx.assignment.findFirst({ where: { id: assignmentId, ownerTeacherId: teacherId, deletedAt: null } });
    if (!a) throw notFound('Không tìm thấy bài tập.');
    return a;
  }

  /** Students targeted by an assignment: active members of target classes ∪ direct targets (dynamic – O-07). */
  async recipients(tx: Tx, assignmentId: string): Promise<string[]> {
    const targets = await tx.assignmentTarget.findMany({ where: { assignmentId } });
    const classIds = targets.filter((t) => t.targetType === 'CLASS' && t.classId).map((t) => t.classId!);
    const direct = targets.filter((t) => t.targetType === 'STUDENT' && t.studentId).map((t) => t.studentId!);
    const members = classIds.length
      ? await tx.classStudent.findMany({ where: { classId: { in: classIds }, leftAt: null }, select: { studentId: true } })
      : [];
    return [...new Set([...members.map((m) => m.studentId), ...direct])];
  }

  /** Teacher may access a submission if they own the assignment and still teach the student in that subject. */
  async teacherSubmission(tx: Tx, teacherId: string, submissionId: string) {
    const s = await tx.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
    if (!s || s.assignment.ownerTeacherId !== teacherId || s.assignment.deletedAt) throw notFound();
    if (!(await this.teacherSeesStudentInSubject(tx, teacherId, s.studentId, s.assignment.subjectId))) {
      // Direct student targets are only visible while the student remains in one of the teacher's classes for the subject.
      throw notFound();
    }
    return s;
  }
}
