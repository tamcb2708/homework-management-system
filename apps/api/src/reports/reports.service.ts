import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.service';
import { ScopeService } from '../academics/scope.service';
import { StudentService } from '../submissions/student.service';
import { currentUser } from '../common/context';
import { notFound } from '../common/errors';
import { num } from '../common/util';
import { closeAt, phaseOf } from '../assignments/phase';
import { studentStatus } from '../submissions/rules';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService, private readonly scope: ScopeService, private readonly students: StudentService) {}

  teacherDashboard() {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const classIds = await this.scope.teacherClassIds(tx, me);
      const studentCount = await tx.classStudent.findMany({ where: { classId: { in: classIds }, leftAt: null }, distinct: ['studentId'], select: { studentId: true } });
      const assignments = await tx.assignment.findMany({
        where: { ownerTeacherId: me, deletedAt: null }, include: { subject: { select: { name: true } }, submissions: { select: { status: true, latestVersionId: true, effectiveGradeId: true } } },
        orderBy: { dueAt: 'asc' },
      });
      const now = new Date();
      const live = assignments.filter((a) => a.status === 'PUBLISHED' || a.status === 'ARCHIVED');
      let targeted = 0, submitted = 0;
      const perAssignment = [] as any[];
      for (const a of live) {
        const rec = (await this.scope.recipients(tx, a.id)).length;
        const sub = a.submissions.filter((s) => s.latestVersionId).length;
        targeted += rec; submitted += sub;
        const effIds = a.submissions.map((s) => s.effectiveGradeId).filter(Boolean) as string[];
        const grades = effIds.length ? await tx.grade.findMany({ where: { id: { in: effIds } }, select: { earnedScore: true, maxScore: true } }) : [];
        const avg = grades.length ? Math.round((grades.reduce((s, g) => s + Number(g.earnedScore) / Number(g.maxScore), 0) / grades.length) * 1000) / 10 : null;
        perAssignment.push({
          id: a.id, title: a.title, subject: a.subject.name, dueAt: a.dueAt, phase: phaseOf(a, now), recipients: rec, submitted: sub,
          toGrade: a.submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADING').length,
          toPublish: a.submissions.filter((s) => s.status === 'GRADED').length, averagePercent: avg, publishedCount: grades.length,
        });
      }
      const count = (st: string) => assignments.filter((a) => a.status === st).length;
      return {
        classes: classIds.length, students: studentCount.length, assignmentsTotal: assignments.length,
        byStatus: { DRAFT: count('DRAFT'), SCHEDULED: count('SCHEDULED'), PUBLISHED: count('PUBLISHED'), REVOKED: count('REVOKED'), ARCHIVED: count('ARCHIVED') },
        notYetDue: live.filter((a) => a.status === 'PUBLISHED' && a.dueAt && a.dueAt > now).length + count('SCHEDULED'),
        pendingGrading: perAssignment.reduce((s, x) => s + x.toGrade, 0),
        pendingPublish: perAssignment.reduce((s, x) => s + x.toPublish, 0),
        graded: assignments.reduce((s, a) => s + a.submissions.filter((x) => x.status === 'PUBLISHED').length, 0),
        completionRate: pct(submitted, targeted),
        needsAction: perAssignment.filter((x) => x.toGrade || x.toPublish).sort((x, y) => y.toGrade - x.toGrade).slice(0, 8),
        scoreStats: perAssignment.filter((x) => x.averagePercent !== null).map((x) => ({ id: x.id, title: x.title, averagePercent: x.averagePercent, count: x.publishedCount })),
        upcoming: perAssignment.filter((x) => x.phase === 'OPEN' || x.phase === 'LATE_PERIOD').slice(0, 6),
      };
    });
  }

  teacherClasses() {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const rows = await tx.classTeacher.findMany({
        where: { teacherId: me, unassignedAt: null, class: { archivedAt: null } },
        include: { class: { include: { schoolYear: true, _count: { select: { students: { where: { leftAt: null } } } } } }, subject: true },
      });
      return rows.map((r) => ({ classId: r.classId, code: r.class.code, name: r.class.name, schoolYear: r.class.schoolYear.name, subject: { id: r.subject.id, name: r.subject.name }, students: r.class._count.students }));
    });
  }

  /** Class view for the teacher: students with completion and average (CLS-02..04). */
  teacherClass(classId: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      await this.scope.assertTeacherTeachesClass(tx, me, classId);
      const c = await tx.class.findUniqueOrThrow({
        where: { id: classId },
        include: { students: { where: { leftAt: null }, include: { student: { include: { user: { select: { fullName: true, email: true } } } } } } },
      });
      const teaching = await tx.classTeacher.findMany({ where: { teacherId: me, classId, unassignedAt: null }, include: { subject: true } });
      const subjectIds = teaching.map((t) => t.subjectId);
      const assignments = await tx.assignment.findMany({
        where: { ownerTeacherId: me, deletedAt: null, subjectId: { in: subjectIds }, status: { in: ['PUBLISHED', 'ARCHIVED'] }, targets: { some: { classId } } },
        include: { submissions: { include: { grades: { where: { status: 'PUBLISHED' } } } } },
      });
      const studentIds = c.students.map((s) => s.studentId);
      const rows = c.students.map((e) => {
        let submitted = 0, total = 0;
        const pcts: number[] = [];
        for (const a of assignments) {
          total++;
          const s = a.submissions.find((x) => x.studentId === e.studentId);
          if (s?.latestVersionId) submitted++;
          const g = s?.grades.find((x) => x.id === s.effectiveGradeId);
          if (g) pcts.push(Number(g.earnedScore) / Number(g.maxScore));
        }
        return {
          id: e.studentId, studentCode: e.student.studentCode, fullName: e.student.user.fullName, email: e.student.user.email,
          assigned: total, submitted, completionRate: pct(submitted, total), averagePercent: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 1000) / 10 : null,
        };
      }).sort((a, b) => a.studentCode.localeCompare(b.studentCode));
      const withAvg = rows.filter((r) => r.averagePercent !== null);
      return {
        id: c.id, code: c.code, name: c.name, subjects: teaching.map((t) => ({ id: t.subject.id, name: t.subject.name })),
        studentCount: studentIds.length, assignmentCount: assignments.length,
        completionRate: pct(rows.reduce((s, r) => s + r.submitted, 0), rows.reduce((s, r) => s + r.assigned, 0)),
        averagePercent: withAvg.length ? Math.round((withAvg.reduce((s, r) => s + r.averagePercent!, 0) / withAvg.length) * 10) / 10 : null,
        lowPerformers: withAvg.filter((r) => r.averagePercent! < 50).map((r) => r.id),
        students: rows,
      };
    });
  }

  /** Learning history of one student within the teacher's subjects (CLS-03). */
  studentHistory(classId: string, studentId: string) {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      await this.scope.assertTeacherTeachesClass(tx, me, classId);
      const enrolled = await tx.classStudent.findFirst({ where: { classId, studentId, leftAt: null }, include: { student: { include: { user: { select: { fullName: true } } } } } });
      if (!enrolled) throw notFound();
      const subjectIds = (await tx.classTeacher.findMany({ where: { teacherId: me, classId, unassignedAt: null } })).map((t) => t.subjectId);
      const assignments = await tx.assignment.findMany({
        where: { ownerTeacherId: me, deletedAt: null, subjectId: { in: subjectIds }, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
        include: { subject: true, submissions: { where: { studentId }, include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 }, grades: true } } },
        orderBy: { dueAt: 'desc' },
      });
      const recips = await Promise.all(assignments.map((a) => this.scope.recipients(tx, a.id)));
      return {
        student: { id: studentId, studentCode: enrolled.student.studentCode, fullName: enrolled.student.user.fullName },
        items: assignments.filter((_, i) => recips[i].includes(studentId)).map((a) => {
          const s = a.submissions[0] ?? null;
          const g = s?.grades.find((x) => x.id === s.effectiveGradeId);
          return {
            assignmentId: a.id, title: a.title, subject: a.subject.name, dueAt: a.dueAt, status: studentStatus(a, s), submissionId: s?.id ?? null,
            submittedAt: s?.versions[0]?.submittedAt ?? null, isLate: s?.versions[0]?.isLate ?? false, earnedScore: num(g?.earnedScore), maxScore: num(a.maxScore),
          };
        }),
      };
    });
  }

  studentDashboard() {
    const me = currentUser().id;
    return this.db.tenant(async (tx) => {
      const rows = await tx.assignment.findMany({
        where: await this.students.visibleWhere(tx, me),
        include: { subject: true, submissions: { where: { studentId: me } } },
        orderBy: { dueAt: 'asc' },
      });
      const now = new Date();
      const effIds = rows.map((a) => a.submissions[0]?.effectiveGradeId).filter(Boolean) as string[];
      const grades = effIds.length ? await tx.grade.findMany({ where: { id: { in: effIds }, status: 'PUBLISHED' } }) : [];
      const items = rows.map((a) => ({ a, s: a.submissions[0] ?? null, status: studentStatus(a, a.submissions[0] ?? null, now) }));
      const by = (st: string) => items.filter((i) => i.status === st).length;
      const soon = items.filter((i) => ['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'].includes(i.status) && closeAt(i.a) && closeAt(i.a)! > now && closeAt(i.a)!.getTime() - now.getTime() < 3 * 86400_000);
      const pcts = grades.map((g) => Number(g.earnedScore) / Number(g.maxScore));
      const recent = await tx.notification.findMany({ where: { userId: me }, orderBy: { createdAt: 'desc' }, take: 6 });
      const view = (i: (typeof items)[number]) => ({ id: i.a.id, title: i.a.title, subject: i.a.subject.name, dueAt: i.a.dueAt, closeAt: closeAt(i.a), status: i.status, maxScore: num(i.a.maxScore) });
      return {
        total: items.length, todo: by('NOT_STARTED') + by('RETURNED'), inProgress: by('IN_PROGRESS'), submitted: by('SUBMITTED'), graded: by('GRADED'), overdue: by('MISSING'),
        dueSoon: soon.map(view),
        newAssignments: items.filter((i) => i.status === 'NOT_STARTED').sort((x, y) => +y.a.openAt! - +x.a.openAt!).slice(0, 5).map(view),
        averagePercent: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 1000) / 10 : null,
        progress: pct(by('SUBMITTED') + by('GRADED'), items.length),
        recentGrades: items.filter((i) => i.status === 'GRADED').map((i) => {
          const g = grades.find((x) => x.id === i.s?.effectiveGradeId);
          return { ...view(i), earnedScore: num(g?.earnedScore), publishedAt: g?.publishedAt };
        }).sort((x, y) => +(y.publishedAt ?? 0) - +(x.publishedAt ?? 0)).slice(0, 5),
        recentActivity: recent.map((n) => ({ id: n.id, title: n.title, createdAt: n.createdAt, link: n.link })),
      };
    });
  }
}
