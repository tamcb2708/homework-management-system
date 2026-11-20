const TZ = 'Asia/Ho_Chi_Minh';

export function fmtDateTime(v?: string | Date | null) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
}

export function fmtDate(v?: string | Date | null) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));
}

export function fmtRelative(v?: string | Date | null, now = Date.now()) {
  if (!v) return '';
  const diff = new Date(v).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000), h = Math.round(abs / 3600000), d = Math.round(abs / 86400000);
  const s = m < 60 ? `${m} phút` : h < 48 ? `${h} giờ` : `${d} ngày`;
  return diff >= 0 ? `còn ${s}` : `${s} trước`;
}

export function fmtScore(v?: number | null) {
  if (v === null || v === undefined) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '').replace('.', ',');
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** <input type="datetime-local"> value in Vietnam time. */
export function toLocalInput(v?: string | Date | null) {
  if (!v) return '';
  const d = new Date(v);
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  return parts.replace(' ', 'T');
}

export function fromLocalInput(s: string) {
  return s ? new Date(`${s}:00+07:00`).toISOString() : undefined;
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const ASSIGNMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SCHEDULED: { label: 'Đã lên lịch', tone: 'info' },
  PUBLISHED: { label: 'Đang giao', tone: 'primary' },
  REVOKED: { label: 'Đã thu hồi', tone: 'danger' },
  ARCHIVED: { label: 'Lưu trữ', tone: 'neutral' },
};

export const PHASE: Record<string, { label: string; tone: Tone }> = {
  UPCOMING: { label: 'Chưa mở', tone: 'info' },
  OPEN: { label: 'Đang mở', tone: 'success' },
  LATE_PERIOD: { label: 'Đang nhận nộp muộn', tone: 'warning' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
};

/** Teacher-side submission labels (business-workflows §4.2). */
export const SUBMISSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Chưa bắt đầu', tone: 'neutral' },
  IN_PROGRESS: { label: 'Đang làm', tone: 'info' },
  SUBMITTED: { label: 'Đã nộp', tone: 'primary' },
  GRADING: { label: 'Đang chấm', tone: 'warning' },
  GRADED: { label: 'Đã chấm', tone: 'success' },
  PUBLISHED: { label: 'Đã công bố', tone: 'success' },
  RETURNED: { label: 'Cần nộp lại', tone: 'warning' },
  MISSING: { label: 'Không nộp', tone: 'danger' },
};

/** Student-side labels. */
export const STUDENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Chưa làm', tone: 'neutral' },
  IN_PROGRESS: { label: 'Đang làm', tone: 'info' },
  SUBMITTED: { label: 'Đã nộp', tone: 'primary' },
  GRADED: { label: 'Đã chấm', tone: 'success' },
  RETURNED: { label: 'Cần nộp lại', tone: 'warning' },
  MISSING: { label: 'Quá hạn', tone: 'danger' },
};

export const QUESTION_TYPE: Record<string, string> = {
  SINGLE_CHOICE: 'Chọn một đáp án',
  MULTIPLE_CHOICE: 'Trắc nghiệm nhiều đáp án',
  TRUE_FALSE: 'Đúng / Sai',
  SHORT_ANSWER: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
  FILE_UPLOAD: 'Nộp tệp',
};

export const GRADE_ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  AUTO_GRADED: { label: 'Chấm tự động', tone: 'info' },
  NEEDS_MANUAL: { label: 'Cần chấm', tone: 'warning' },
  AI_PENDING: { label: 'AI đang chấm', tone: 'info' },
  AI_SUGGESTED: { label: 'AI đề xuất', tone: 'primary' },
  FINAL: { label: 'Đã chấm', tone: 'success' },
};

export const ROLE_LABEL: Record<string, string> = { SCHOOL_ADMIN: 'Quản trị trường', TEACHER: 'Giáo viên', STUDENT: 'Học sinh' };

export const ROLE_HOME: Record<string, string> = { SCHOOL_ADMIN: '/admin', TEACHER: '/teacher', STUDENT: '/student' };

export function homeFor(roles: string[]) {
  for (const r of ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT']) if (roles.includes(r)) return ROLE_HOME[r];
  return '/login';
}
