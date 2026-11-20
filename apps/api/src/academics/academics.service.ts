import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { currentTenantId } from '../common/context';
import { ClassDto, EnrollDto, SchoolYearDto, SemesterDto, SubjectDto, TeachingDto, UpdateClassDto, UpdateSubjectDto } from './dto';

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class AcademicsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  // ── School years & semesters ──
  listYears() {
    return this.db.tenant((tx) =>
      tx.schoolYear.findMany({ orderBy: { startDate: 'desc' }, include: { semesters: { orderBy: { ordinal: 'asc' } }, _count: { select: { classes: true } } } }),
    );
  }

  createYear(dto: SchoolYearDto) {
    if (day(dto.endDate) <= day(dto.startDate)) throw badRequest('INVALID_DATES', 'Ngày kết thúc phải sau ngày bắt đầu.');
    return this.db.tenant(async (tx) => {
      if (dto.isCurrent) await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const y = await tx.schoolYear.create({
        data: { tenantId: currentTenantId(), name: dto.name.trim(), startDate: day(dto.startDate), endDate: day(dto.endDate), isCurrent: !!dto.isCurrent },
      });
      await this.audit.log(tx, { action: 'school_year.create', resourceType: 'school_year', resourceId: y.id, metadata: { name: y.name } });
      return y;
    });
  }

  updateYear(id: string, dto: SchoolYearDto) {
    if (day(dto.endDate) <= day(dto.startDate)) throw badRequest('INVALID_DATES', 'Ngày kết thúc phải sau ngày bắt đầu.');
    return this.db.tenant(async (tx) => {
      await tx.schoolYear.findUniqueOrThrow({ where: { id } });
      if (dto.isCurrent) await tx.schoolYear.updateMany({ where: { isCurrent: true, NOT: { id } }, data: { isCurrent: false } });
      const y = await tx.schoolYear.update({
        where: { id },
        data: { name: dto.name.trim(), startDate: day(dto.startDate), endDate: day(dto.endDate), isCurrent: dto.isCurrent ?? undefined },
      });
      await this.audit.log(tx, { action: 'school_year.update', resourceType: 'school_year', resourceId: id });
      return y;
    });
  }

  createSemester(yearId: string, dto: SemesterDto) {
    return this.db.tenant(async (tx) => {
      const y = await tx.schoolYear.findUnique({ where: { id: yearId } });
      if (!y) throw notFound();
      const s = day(dto.startDate), e = day(dto.endDate);
      if (e <= s || s < y.startDate || e > y.endDate) throw badRequest('INVALID_DATES', 'Thời gian học kỳ phải nằm trong năm học.');
      const sem = await tx.semester.create({ data: { tenantId: currentTenantId(), schoolYearId: yearId, name: dto.name.trim(), ordinal: dto.ordinal, startDate: s, endDate: e } });
      await this.audit.log(tx, { action: 'semester.create', resourceType: 'semester', resourceId: sem.id });
      return sem;
    });
  }

  deleteSemester(id: string) {
    return this.db.tenant(async (tx) => {
      const used = await tx.classTeacher.count({ where: { semesterId: id } });
      if (used) throw conflict('SEMESTER_IN_USE', 'Học kỳ đang được dùng trong phân công giảng dạy.');
      await tx.semester.delete({ where: { id } });
      await this.audit.log(tx, { action: 'semester.delete', resourceType: 'semester', resourceId: id });
      return { ok: true };
    });
  }

  // ── Subjects ──
  listSubjects(includeArchived = false) {
    return this.db.tenant((tx) => tx.subject.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: { name: 'asc' } }));
  }

  createSubject(dto: SubjectDto) {
    return this.db.tenant(async (tx) => {
      const s = await tx.subject.create({ data: { tenantId: currentTenantId(), code: dto.code.trim().toUpperCase(), name: dto.name.trim() } });
      await this.audit.log(tx, { action: 'subject.create', resourceType: 'subject', resourceId: s.id, metadata: { code: s.code } });
      return s;
    });
  }

  updateSubject(id: string, dto: UpdateSubjectDto) {
    return this.db.tenant(async (tx) => {
      const s = await tx.subject.update({
        where: { id },
        data: { name: dto.name?.trim(), archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null },
      });
      await this.audit.log(tx, { action: 'subject.update', resourceType: 'subject', resourceId: id, metadata: { ...dto } });
      return s;
    });
  }

  // ── Classes ──
  listClasses(q?: string, schoolYearId?: string, includeArchived = false) {
    return this.db.tenant(async (tx) => {
      const rows = await tx.class.findMany({
        where: {
          ...(includeArchived ? {} : { archivedAt: null }),
          ...(schoolYearId ? { schoolYearId } : {}),
          ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}),
        },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
        include: {
          schoolYear: { select: { id: true, name: true } },
          homeroomTeacher: { select: { userId: true, user: { select: { fullName: true } } } },
          _count: { select: { students: { where: { leftAt: null } }, teachers: { where: { unassignedAt: null } } } },
        },
      });
      return rows.map((c) => ({
        id: c.id, code: c.code, name: c.name, gradeLevel: c.gradeLevel, archivedAt: c.archivedAt, schoolYear: c.schoolYear,
        homeroomTeacher: c.homeroomTeacher ? { id: c.homeroomTeacher.userId, fullName: c.homeroomTeacher.user.fullName } : null,
        studentCount: c._count.students, teacherCount: c._count.teachers,
      }));
    });
  }

  createClass(dto: ClassDto) {
    return this.db.tenant(async (tx) => {
      if (dto.homeroomTeacherId) await this.requireTeacher(tx, dto.homeroomTeacherId);
      const c = await tx.class.create({
        data: {
          tenantId: currentTenantId(), code: dto.code.trim().toUpperCase(), name: dto.name.trim(), schoolYearId: dto.schoolYearId,
          gradeLevel: dto.gradeLevel, homeroomTeacherId: dto.homeroomTeacherId,
        },
      });
      await this.audit.log(tx, { action: 'class.create', resourceType: 'class', resourceId: c.id, metadata: { code: c.code } });
      return c;
    });
  }

  updateClass(id: string, dto: UpdateClassDto) {
    return this.db.tenant(async (tx) => {
      if (dto.homeroomTeacherId) await this.requireTeacher(tx, dto.homeroomTeacherId);
      const c = await tx.class.update({
        where: { id },
        data: {
          name: dto.name?.trim(), gradeLevel: dto.gradeLevel, homeroomTeacherId: dto.homeroomTeacherId,
          archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
        },
      });
      await this.audit.log(tx, { action: 'class.update', resourceType: 'class', resourceId: id, metadata: { ...dto } });
      return c;
    });
  }

  classDetail(id: string) {
    return this.db.tenant(async (tx) => {
      const c = await tx.class.findUnique({
        where: { id },
        include: {
          schoolYear: true,
          homeroomTeacher: { include: { user: { select: { fullName: true } } } },
          students: { where: { leftAt: null }, include: { student: { include: { user: { select: { id: true, fullName: true, email: true, status: true } } } } } },
          teachers: { where: { unassignedAt: null }, include: { teacher: { include: { user: { select: { fullName: true, email: true } } } }, subject: true, semester: true } },
        },
      });
      if (!c) throw notFound();
      return {
        id: c.id, code: c.code, name: c.name, gradeLevel: c.gradeLevel, archivedAt: c.archivedAt,
        schoolYear: { id: c.schoolYear.id, name: c.schoolYear.name },
        homeroomTeacher: c.homeroomTeacher ? { id: c.homeroomTeacher.userId, fullName: c.homeroomTeacher.user.fullName } : null,
        students: c.students
          .map((e) => ({ enrollmentId: e.id, id: e.studentId, studentCode: e.student.studentCode, fullName: e.student.user.fullName, email: e.student.user.email, status: e.student.user.status, joinedAt: e.joinedAt }))
          .sort((a, b) => a.studentCode.localeCompare(b.studentCode)),
        teachers: c.teachers.map((t) => ({
          id: t.id, teacherId: t.teacherId, fullName: t.teacher.user.fullName, email: t.teacher.user.email,
          subject: { id: t.subject.id, code: t.subject.code, name: t.subject.name }, semester: t.semester ? { id: t.semester.id, name: t.semester.name } : null,
        })),
      };
    });
  }

  enroll(classId: string, dto: EnrollDto) {
    return this.db.tenant(async (tx) => {
      const c = await tx.class.findUnique({ where: { id: classId } });
      if (!c || c.archivedAt) throw notFound();
      // Only students of THIS tenant can be found (RLS); composite FK is the last line of defence.
      const students = await tx.student.findMany({ where: { userId: { in: dto.studentIds } }, select: { userId: true } });
      if (students.length !== new Set(dto.studentIds).size) throw notFound('Có học sinh không tồn tại.');
      const existing = await tx.classStudent.findMany({ where: { classId, leftAt: null, studentId: { in: dto.studentIds } }, select: { studentId: true } });
      const have = new Set(existing.map((e) => e.studentId));
      const toAdd = [...new Set(dto.studentIds)].filter((s) => !have.has(s));
      if (toAdd.length) await tx.classStudent.createMany({ data: toAdd.map((studentId) => ({ tenantId: currentTenantId(), classId, studentId })) });
      await this.audit.log(tx, { action: 'class.enroll', resourceType: 'class', resourceId: classId, metadata: { added: toAdd, skipped: [...have] } });
      return { added: toAdd.length, skipped: have.size };
    });
  }

  unenroll(classId: string, studentId: string) {
    return this.db.tenant(async (tx) => {
      const r = await tx.classStudent.updateMany({ where: { classId, studentId, leftAt: null }, data: { leftAt: new Date() } });
      if (!r.count) throw notFound();
      await this.audit.log(tx, { action: 'class.unenroll', resourceType: 'class', resourceId: classId, metadata: { studentId } });
      return { ok: true };
    });
  }

  assignTeacher(classId: string, dto: TeachingDto) {
    return this.db.tenant(async (tx) => {
      const c = await tx.class.findUnique({ where: { id: classId } });
      if (!c || c.archivedAt) throw notFound();
      await this.requireTeacher(tx, dto.teacherId);
      const subject = await tx.subject.findUnique({ where: { id: dto.subjectId } });
      if (!subject || subject.archivedAt) throw notFound('Không tìm thấy môn học.');
      const dup = await tx.classTeacher.findFirst({ where: { classId, teacherId: dto.teacherId, subjectId: dto.subjectId, semesterId: dto.semesterId ?? null, unassignedAt: null } });
      if (dup) throw conflict('ALREADY_ASSIGNED', 'Giáo viên đã được phân công môn này cho lớp.');
      const t = await tx.classTeacher.create({ data: { tenantId: currentTenantId(), classId, teacherId: dto.teacherId, subjectId: dto.subjectId, semesterId: dto.semesterId } });
      await this.audit.log(tx, { action: 'teaching_assignment.create', resourceType: 'class', resourceId: classId, metadata: { ...dto } });
      return t;
    });
  }

  unassignTeacher(classId: string, teachingId: string) {
    return this.db.tenant(async (tx) => {
      const r = await tx.classTeacher.updateMany({ where: { id: teachingId, classId, unassignedAt: null }, data: { unassignedAt: new Date() } });
      if (!r.count) throw notFound();
      await this.audit.log(tx, { action: 'teaching_assignment.remove', resourceType: 'class', resourceId: classId, metadata: { teachingId } });
      return { ok: true };
    });
  }

  private async requireTeacher(tx: any, teacherId: string) {
    const t = await tx.teacher.findUnique({ where: { userId: teacherId }, include: { user: true } });
    if (!t || t.user.deletedAt) throw notFound('Không tìm thấy giáo viên.');
    return t;
  }
}
