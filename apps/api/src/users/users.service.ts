import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { conflict, notFound, unprocessable } from '../common/errors';
import { currentTenantId, currentUser } from '../common/context';
import { normalizeIdentifier, pageParams } from '../common/util';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { CreateStudentDto, CreateTeacherDto, ListUsersQuery, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  list(q: ListUsersQuery) {
    const { skip, take, page, pageSize } = pageParams(Number(q.page), Number(q.pageSize));
    return this.db.tenant(async (tx) => {
      const where: Prisma.UserWhereInput = {
        deletedAt: null,
        roles: { some: { role: q.role } },
        ...(q.status ? { status: q.status } : {}),
        ...(q.q
          ? { OR: [
              { fullName: { contains: q.q, mode: 'insensitive' } },
              { username: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
            ] }
          : {}),
        ...(q.classId ? { student: { enrollments: { some: { classId: q.classId, leftAt: null } } } } : {}),
      };
      const [total, rows] = await Promise.all([
        tx.user.count({ where }),
        tx.user.findMany({
          where, skip, take, orderBy: q.role === 'STUDENT' ? { username: 'asc' } : { fullName: 'asc' },
          include: {
            roles: true,
            teacher: { include: { teaching: { where: { unassignedAt: null }, include: { class: { select: { code: true } }, subject: { select: { name: true } } } } } },
            student: { include: { enrollments: { where: { leftAt: null }, include: { class: { select: { id: true, code: true } } } } } },
          },
        }),
      ]);
      return {
        total, page, pageSize,
        items: rows.map((u) => ({
          id: u.id, fullName: u.fullName, username: u.username, email: u.email, phone: u.phone, status: u.status,
          mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
          roles: u.roles.map((r) => r.role),
          studentCode: u.student?.studentCode ?? null,
          dateOfBirth: u.student?.dateOfBirth ?? null,
          classes: u.student?.enrollments.map((e) => e.class) ?? [],
          teacherCode: u.teacher?.teacherCode ?? null,
          specialization: u.teacher?.specialization ?? null,
          teaching: u.teacher?.teaching.map((t) => `${t.class.code} · ${t.subject.name}`) ?? [],
        })),
      };
    });
  }

  private async checkQuota(tx: Tx) {
    const t = await this.db.appClient.tenant.findUnique({ where: { id: currentTenantId() }, select: { maxUsers: true } });
    if (t?.maxUsers) {
      const n = await tx.user.count({ where: { deletedAt: null } });
      if (n >= t.maxUsers) throw unprocessable('USER_QUOTA_EXCEEDED', 'Trường đã đạt giới hạn số tài khoản.');
    }
  }

  async createTeacher(dto: CreateTeacherDto) {
    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    return this.db.tenant(async (tx) => {
      await this.checkQuota(tx);
      const email = normalizeIdentifier(dto.email);
      const user = await tx.user.create({
        data: {
          tenantId: currentTenantId(), username: email, email, fullName: dto.fullName.trim(), phone: dto.phone, passwordHash,
          mustChangePassword: true,
          roles: { create: { role: 'TEACHER' } },
          teacher: { create: { teacherCode: dto.teacherCode?.trim().toUpperCase(), specialization: dto.specialization } },
        },
      });
      await this.audit.log(tx, { action: 'user.create', resourceType: 'user', resourceId: user.id, metadata: { role: 'TEACHER', email } });
      return { id: user.id, username: user.username, temporaryPassword: tempPassword };
    });
  }

  async createStudent(dto: CreateStudentDto) {
    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    return this.db.tenant(async (tx) => {
      await this.checkQuota(tx);
      const code = normalizeIdentifier(dto.studentCode).toUpperCase();
      const tenantId = currentTenantId();
      if (dto.classId) {
        const c = await tx.class.findUnique({ where: { id: dto.classId } });
        if (!c || c.archivedAt) throw notFound('Không tìm thấy lớp.');
      }
      const user = await tx.user.create({
        data: {
          tenantId, username: code.toLowerCase(), email: dto.email ? normalizeIdentifier(dto.email) : null, fullName: dto.fullName.trim(), passwordHash,
          mustChangePassword: true,
          roles: { create: { role: 'STUDENT' } },
          student: { create: { studentCode: code, dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth.slice(0, 10)) : null } },
        },
      });
      if (dto.classId) await tx.classStudent.create({ data: { tenantId, classId: dto.classId, studentId: user.id } });
      await this.audit.log(tx, { action: 'user.create', resourceType: 'user', resourceId: user.id, metadata: { role: 'STUDENT', studentCode: code } });
      return { id: user.id, username: code, temporaryPassword: tempPassword };
    });
  }

  update(id: string, dto: UpdateUserDto) {
    return this.db.tenant(async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, include: { teacher: true, student: true, roles: true } });
      if (!u || u.deletedAt) throw notFound();
      const email = dto.email ? normalizeIdentifier(dto.email) : undefined;
      const isTeacherOnly = u.roles.some((r) => r.role !== 'STUDENT');
      await tx.user.update({
        where: { id },
        data: { fullName: dto.fullName?.trim(), email, phone: dto.phone, ...(email && isTeacherOnly && u.username === u.email ? { username: email } : {}) },
      });
      if (u.teacher && dto.specialization !== undefined) await tx.teacher.update({ where: { userId: id }, data: { specialization: dto.specialization } });
      if (u.student && dto.dateOfBirth !== undefined) await tx.student.update({ where: { userId: id }, data: { dateOfBirth: new Date(dto.dateOfBirth.slice(0, 10)) } });
      await this.audit.log(tx, { action: 'user.update', resourceType: 'user', resourceId: id, metadata: { fields: Object.keys(dto) } });
      return { ok: true };
    });
  }

  setLocked(id: string, locked: boolean) {
    return this.db.tenant(async (tx) => {
      if (id === currentUser().id) throw conflict('CANNOT_LOCK_SELF', 'Không thể tự khóa tài khoản của mình.');
      const u = await tx.user.findUnique({ where: { id } });
      if (!u || u.deletedAt) throw notFound();
      await tx.user.update({ where: { id }, data: { status: locked ? 'LOCKED' : 'ACTIVE', authzVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
      if (locked) await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'account_locked' } });
      await this.audit.log(tx, { action: locked ? 'user.lock' : 'user.unlock', resourceType: 'user', resourceId: id });
      return { ok: true };
    });
  }

  async resetPassword(id: string) {
    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    return this.db.tenant(async (tx) => {
      const u = await tx.user.findUnique({ where: { id } });
      if (!u || u.deletedAt) throw notFound();
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, authzVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'password_reset' } });
      await this.audit.log(tx, { action: 'user.password.reset', resourceType: 'user', resourceId: id });
      return { temporaryPassword: tempPassword };
    });
  }
}
