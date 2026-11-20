import type { Assignment, Submission } from '@prisma/client';
import { closeAt, phaseOf } from '../assignments/phase';

export type StudentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'RETURNED' | 'MISSING';

/** Student-facing status (business-workflows §4.2). SUBMITTED/GRADING/GRADED all read "Đã nộp" until published. */
export function studentStatus(a: Assignment, s: Submission | null, now = new Date()): StudentStatus {
  const closed = phaseOf(a, now) === 'CLOSED';
  if (!s) return closed ? 'MISSING' : 'NOT_STARTED';
  switch (s.status) {
    case 'RETURNED':
      return 'RETURNED';
    case 'IN_PROGRESS':
      if (!s.returnedAt && !s.latestVersionId && closed) return 'MISSING';
      return s.returnedAt ? 'RETURNED' : 'IN_PROGRESS';
    case 'PUBLISHED':
      return 'GRADED';
    default:
      return 'SUBMITTED';
  }
}

/** Last moment a submission is accepted (before grace). */
export function submitDeadline(a: Assignment, s: Pick<Submission, 'returnedAt' | 'returnedDueAt' | 'deadlineAt'>): Date | null {
  let base = s.returnedAt ? (s.returnedDueAt ?? closeAt(a)) : closeAt(a);
  if (base && s.deadlineAt && s.deadlineAt < base) base = s.deadlineAt;
  return base;
}

export function windowOpen(a: Assignment, now = new Date()): boolean {
  const p = phaseOf(a, now);
  return a.status === 'PUBLISHED' && (p === 'OPEN' || p === 'LATE_PERIOD');
}

export function returnedWindowOpen(a: Assignment, s: Pick<Submission, 'returnedDueAt'>, now = new Date()): boolean {
  if (a.status !== 'PUBLISHED') return false;
  if (s.returnedDueAt) return now <= s.returnedDueAt;
  return phaseOf(a, now) !== 'CLOSED' && phaseOf(a, now) !== 'UPCOMING';
}

export function canResubmit(a: Assignment, s: Submission, now = new Date()): boolean {
  return a.allowResubmit && s.attemptCount < a.maxAttempts && windowOpen(a, now) && ['SUBMITTED', 'GRADING', 'GRADED', 'PUBLISHED'].includes(s.status);
}

/** Personal deadline for timed work: min(start + limit, close). */
export function personalDeadline(a: Assignment, startedAt: Date, base: Date | null): Date | null {
  if (!a.timeLimitMinutes) return null;
  const byTimer = new Date(startedAt.getTime() + a.timeLimitMinutes * 60_000);
  return base && base < byTimer ? base : byTimer;
}

export function answersVisible(a: Assignment, hasVersion: boolean, published: boolean, now = new Date()): boolean {
  switch (a.answerVisibility) {
    case 'NEVER': return false;
    case 'AFTER_SUBMIT': return hasVersion;
    case 'AFTER_DUE': { const c = closeAt(a); return !!c && now > c; }
    case 'AFTER_PUBLISH': return published;
  }
}
