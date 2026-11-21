export interface Timed { openAt: Date | null; dueAt: Date | null; allowLate: boolean; lateUntil: Date | null }

export type Phase = 'UPCOMING' | 'OPEN' | 'LATE_PERIOD' | 'CLOSED';

export function closeAt(a: Timed): Date | null {
  return a.allowLate && a.lateUntil ? a.lateUntil : a.dueAt;
}

export function phaseOf(a: Timed, now = new Date()): Phase {
  if (!a.openAt || !a.dueAt || now < a.openAt) return 'UPCOMING';
  if (now <= a.dueAt) return 'OPEN';
  if (a.allowLate && a.lateUntil && now <= a.lateUntil) return 'LATE_PERIOD';
  return 'CLOSED';
}
