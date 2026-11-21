/**
 * Automatic grading rule engine (GRD-02, BR-31). Pure functions – no I/O.
 * Deterministic question types are graded immediately; open answers go to NEEDS_MANUAL (D9.1: AI never runs by itself).
 */
export type QType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY' | 'FILE_UPLOAD';

export interface GradableQuestion {
  type: QType;
  points: number;
  config: Record<string, any>;
  options: { id: string; isCorrect: boolean }[];
}

export interface Answer {
  selected?: string[];
  text?: string;
  doc?: unknown;
  fileIds?: string[];
}

export type AutoResult = { status: 'AUTO_GRADED'; score: number } | { status: 'NEEDS_MANUAL' };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function normalizeShort(s: string, cfg: { caseSensitive?: boolean; ignoreDiacritics?: boolean }): string {
  let v = s.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!cfg.caseSensitive) v = v.toLowerCase();
  if (cfg.ignoreDiacritics) v = stripDiacritics(v);
  return v;
}

function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function isEmptyAnswer(type: QType, a: Answer | undefined): boolean {
  if (!a) return true;
  switch (type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE':
      return !a.selected?.length;
    case 'FILE_UPLOAD':
      return !a.fileIds?.length;
    default:
      return !a.text?.trim();
  }
}

export function gradeAuto(q: GradableQuestion, a: Answer | undefined): AutoResult {
  const correct = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      const sel = a?.selected ?? [];
      const ok = sel.length === 1 && correct.has(sel[0]);
      return { status: 'AUTO_GRADED', score: ok ? q.points : 0 };
    }
    case 'MULTIPLE_CHOICE': {
      const sel = new Set(a?.selected ?? []);
      if (!sel.size || !correct.size) return { status: 'AUTO_GRADED', score: 0 };
      const right = [...sel].filter((s) => correct.has(s)).length;
      const wrong = sel.size - right;
      if (q.config?.scoring === 'PARTIAL') {
        const ratio = Math.max(0, (right - wrong) / correct.size);
        return { status: 'AUTO_GRADED', score: round2(q.points * ratio) };
      }
      return { status: 'AUTO_GRADED', score: right === correct.size && wrong === 0 ? q.points : 0 };
    }
    case 'SHORT_ANSWER': {
      const text = a?.text ?? '';
      if (!text.trim()) return { status: 'AUTO_GRADED', score: 0 };
      const accepted: string[] = Array.isArray(q.config?.accepted) ? q.config.accepted.filter((s: unknown) => typeof s === 'string' && s.trim()) : [];
      if (!accepted.length) return { status: 'NEEDS_MANUAL' };
      const tol = typeof q.config?.numericTolerance === 'number' ? q.config.numericTolerance : null;
      const given = parseNumber(text);
      for (const acc of accepted) {
        if (tol !== null && given !== null) {
          const target = parseNumber(acc);
          if (target !== null && Math.abs(target - given) <= tol + 1e-9) return { status: 'AUTO_GRADED', score: q.points };
        }
        if (normalizeShort(acc, q.config) === normalizeShort(text, q.config)) return { status: 'AUTO_GRADED', score: q.points };
      }
      // Not matched: teacher (or AI, when approved) decides unless configured to score 0 directly.
      return q.config?.zeroIfNoMatch ? { status: 'AUTO_GRADED', score: 0 } : { status: 'NEEDS_MANUAL' };
    }
    case 'ESSAY':
    case 'FILE_UPLOAD':
    default:
      return { status: 'NEEDS_MANUAL' };
  }
}

/** Validates the answer key of a question before publishing (BR-10). Returns an error message or null. */
export function answerKeyProblem(q: { type: QType; options: { isCorrect: boolean }[]; config: Record<string, any> }): string | null {
  const nCorrect = q.options.filter((o) => o.isCorrect).length;
  switch (q.type) {
    case 'SINGLE_CHOICE':
      if (q.options.length < 2) return 'Câu chọn một đáp án cần ít nhất 2 lựa chọn.';
      return nCorrect === 1 ? null : 'Câu chọn một đáp án phải có đúng 1 đáp án đúng.';
    case 'TRUE_FALSE':
      if (q.options.length !== 2) return 'Câu Đúng/Sai phải có đúng 2 lựa chọn.';
      return nCorrect === 1 ? null : 'Câu Đúng/Sai phải có đúng 1 đáp án đúng.';
    case 'MULTIPLE_CHOICE':
      if (q.options.length < 2) return 'Câu nhiều đáp án cần ít nhất 2 lựa chọn.';
      return nCorrect >= 1 ? null : 'Câu nhiều đáp án phải có ít nhất 1 đáp án đúng.';
    default:
      return null;
  }
}

/** Sum of official scores; null if any item has no official score yet. */
export function totalIfComplete(items: { earnedScore: number | null }[]): number | null {
  if (items.some((i) => i.earnedScore === null)) return null;
  return round2(items.reduce((s, i) => s + (i.earnedScore ?? 0), 0));
}
