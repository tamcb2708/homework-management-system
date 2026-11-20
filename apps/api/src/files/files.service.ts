import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { FilePurpose } from '@prisma/client';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../academics/scope.service';
import { StudentService } from '../submissions/student.service';
import { badRequest, notFound, unprocessable } from '../common/errors';
import { currentTenantId, currentUser } from '../common/context';
import { StorageService } from './storage';
import { detectType, MIME, safeFilename } from './file-type';

const PURPOSE_ROLES: Record<string, string[]> = {
  ASSIGNMENT_ATTACHMENT: ['TEACHER'],
  QUESTION_MEDIA: ['TEACHER'],
  ANSWER_UPLOAD: ['STUDENT'],
};

@Injectable()
export class FilesService {
  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly students: StudentService,
  ) {}

  async upload(file: Express.Multer.File | undefined, purpose: FilePurpose) {
    const u = currentUser();
    if (!file) throw badRequest('FILE_REQUIRED', 'Vui lòng chọn tệp.');
    if (!PURPOSE_ROLES[purpose] || !PURPOSE_ROLES[purpose].some((r) => u.roles.includes(r as any))) throw badRequest('INVALID_PURPOSE', 'Mục đích tải lên không hợp lệ.');
    const tenantId = currentTenantId();
    const settings = await this.db.tenant((tx) => tx.tenantSettings.findUnique({ where: { tenantId } }));
    const allowed = (settings?.fileAllowedTypes ?? ['pdf', 'docx', 'xlsx', 'pptx', 'jpg', 'png']).map((s) => s.toLowerCase());
    if (purpose === 'QUESTION_MEDIA' && !allowed.includes('png')) allowed.push('png');
    const name = safeFilename(file.originalname);
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    const extAllowed = allowed.includes(ext) || (ext === 'jpeg' && allowed.includes('jpg'));
    if (!extAllowed) throw unprocessable('FILE_TYPE_NOT_ALLOWED', `Định dạng .${ext || '?'} không được phép. Cho phép: ${allowed.join(', ')}.`);
    const max = settings?.fileMaxBytes ?? 20 * 1024 * 1024;
    if (file.size > max) throw unprocessable('FILE_TOO_LARGE', `Tệp vượt quá ${Math.round(max / 1024 / 1024)} MB.`);
    if (file.size === 0) throw unprocessable('FILE_EMPTY', 'Tệp rỗng.');
    const kind = detectType(file.buffer, ext);
    if (!kind) throw unprocessable('FILE_CONTENT_MISMATCH', 'Nội dung tệp không khớp với định dạng (tệp có thể bị đổi đuôi hoặc hỏng).');
    const tenant = await this.db.appClient.tenant.findUnique({ where: { id: tenantId }, select: { maxStorageBytes: true } });
    if (tenant?.maxStorageBytes) {
      const used = await this.db.tenant((tx) => tx.fileObject.aggregate({ where: { status: 'ACTIVE' }, _sum: { sizeBytes: true } }));
      if (BigInt(used._sum.sizeBytes ?? 0) + BigInt(file.size) > tenant.maxStorageBytes) throw unprocessable('STORAGE_QUOTA_EXCEEDED', 'Trường đã hết dung lượng lưu trữ.');
    }
    const id = randomUUID();
    const now = new Date();
    const key = `t/${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
    const mimeType = MIME[kind] ?? 'application/octet-stream';
    await this.storage.put(key, file.buffer, mimeType);
    try {
      return await this.db.tenant(async (tx) => {
        const f = await tx.fileObject.create({
          data: { id, tenantId, storageKey: key, originalName: name, mimeType, extension: kind, sizeBytes: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), purpose, uploadedBy: u.id },
        });
        await this.audit.log(tx, { action: 'file.upload', resourceType: 'file', resourceId: f.id, metadata: { purpose, size: f.sizeBytes, ext: kind } });
        return { id: f.id, name: f.originalName, size: f.sizeBytes, mimeType: f.mimeType };
      });
    } catch (e) {
      await this.storage.remove(key);
      throw e;
    }
  }

  /** Permission is derived from the record that owns the file, never from the file itself (erd §8.11). */
  private async canRead(tx: Tx, fileId: string): Promise<boolean> {
    const u = currentUser();
    const f = await tx.fileObject.findUnique({ where: { id: fileId }, include: { assignmentLinks: true, questionLinks: { include: { question: true } }, submissionLinks: { include: { version: { include: { submission: true } } } } } });
    if (!f || f.status !== 'ACTIVE') return false;
    if (f.uploadedBy === u.id) return true;
    const assignmentIds = [...f.assignmentLinks.map((l) => l.assignmentId), ...f.questionLinks.map((l) => l.question.assignmentId)];
    for (const aid of assignmentIds) {
      if (u.roles.includes('SCHOOL_ADMIN')) return true;
      if (u.roles.includes('TEACHER')) {
        const a = await tx.assignment.findUnique({ where: { id: aid } });
        if (a && (a.ownerTeacherId === u.id || (await tx.classTeacher.findFirst({ where: { teacherId: u.id, subjectId: a.subjectId, unassignedAt: null } })))) return true;
      }
      if (u.roles.includes('STUDENT')) {
        const visible = await tx.assignment.findFirst({ where: { id: aid, ...(await this.students.visibleWhere(tx, u.id)) }, select: { id: true } });
        if (visible) return true;
      }
    }
    for (const l of f.submissionLinks) {
      const s = l.version.submission;
      if (u.roles.includes('STUDENT') && s.studentId === u.id) return true;
      if (u.roles.includes('TEACHER') && (await this.scope.teacherSubmission(tx, u.id, s.id).then(() => true, () => false))) return true;
    }
    return false;
  }

  async download(fileId: string) {
    return this.db.tenant(async (tx) => {
      if (!(await this.canRead(tx, fileId))) throw notFound();
      const f = await tx.fileObject.findUniqueOrThrow({ where: { id: fileId } });
      const url = await this.storage.signedUrl(f.storageKey, f.originalName, f.mimeType);
      return { file: f, url, body: url ? null : await this.storage.read(f.storageKey) };
    });
  }
}
