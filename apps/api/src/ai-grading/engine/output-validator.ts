/** Never trust AI output (ai-grading-design §7.2): strict shape, bounds, recomputed total, plain-text feedback. */
export interface ExpectedCriterion { id: string; name: string; maxScore: number }

export interface ValidatedSuggestion {
  suggestedScore: number;
  maxScore: number;
  confidence: number;
  criteria: { criterionId: string; name: string; score: number; maxScore: number; feedback: string }[];
  strengths: string[];
  weaknesses: string[];
  missingPoints: string[];
  overallFeedback: string;
  needsTeacherReview: true;
  notes: string[];
}

export type ValidationOutcome = { ok: true; value: ValidatedSuggestion } | { ok: false; errors: string[] };

const ALLOWED = new Set(['suggested_score', 'max_score', 'confidence', 'criteria', 'strengths', 'weaknesses', 'missing_points', 'overall_feedback', 'needs_teacher_review']);
// eslint-disable-next-line no-control-regex -- intentionally strips control characters from AI output
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n) : '');
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 10).map((x) => clip(x, 500)) : null);

export function validateSuggestion(raw: unknown, expected: ExpectedCriterion[], maxScore: number, step: number): ValidationOutcome {
  let obj: any = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return { ok: false, errors: ['invalid_json'] }; }
  }
  const errors: string[] = [];
  const notes: string[] = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['not_an_object'] };
  for (const k of Object.keys(obj)) if (!ALLOWED.has(k)) errors.push(`unexpected_field:${k}`);
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) errors.push('confidence_out_of_range');
  if (!Array.isArray(obj.criteria)) errors.push('criteria_missing');
  const strengths = list(obj.strengths), weaknesses = list(obj.weaknesses), missing = list(obj.missing_points ?? []);
  if (!strengths || !weaknesses || !missing) errors.push('lists_invalid');
  if (typeof obj.overall_feedback !== 'string') errors.push('feedback_missing');
  const criteria: ValidatedSuggestion['criteria'] = [];
  if (Array.isArray(obj.criteria)) {
    const seen = new Set<string>();
    for (const c of obj.criteria) {
      const exp = expected.find((e) => e.id === c?.criterion_id);
      if (!exp) { errors.push(`unknown_criterion:${String(c?.criterion_id)}`); continue; }
      if (seen.has(exp.id)) { errors.push(`duplicate_criterion:${exp.id}`); continue; }
      seen.add(exp.id);
      if (typeof c.score !== 'number' || !Number.isFinite(c.score) || c.score < 0 || c.score > exp.maxScore) { errors.push(`score_out_of_range:${exp.id}`); continue; }
      const rounded = Math.floor(c.score / step + 1e-9) * step;
      if (Math.abs(rounded - c.score) > 1e-9) notes.push(`rounded_down:${exp.id}`);
      criteria.push({ criterionId: exp.id, name: exp.name, score: Math.round(rounded * 100) / 100, maxScore: exp.maxScore, feedback: clip(c.feedback, 2000) });
    }
    for (const e of expected) if (!seen.has(e.id)) errors.push(`missing_criterion:${e.id}`);
  }
  if (errors.length) return { ok: false, errors };
  const total = Math.round(criteria.reduce((s, c) => s + c.score, 0) * 100) / 100;
  if (typeof obj.suggested_score === 'number' && Math.abs(obj.suggested_score - total) > 1e-6) notes.push('total_recomputed');
  if (total > maxScore) return { ok: false, errors: ['total_exceeds_max'] };
  return {
    ok: true,
    value: {
      suggestedScore: total, maxScore, confidence: obj.confidence, criteria,
      strengths: strengths!, weaknesses: weaknesses!, missingPoints: missing!, overallFeedback: clip(obj.overall_feedback, 2000),
      needsTeacherReview: true, notes,
    },
  };
}

const INJECTION = [/bỏ qua (mọi |tất cả )?(hướng dẫn|chỉ dẫn)/i, /ignore (all |any )?(previous|prior) instructions/i, /cho (tôi |em )?(điểm )?10( điểm)?/i, /system prompt/i, /you are now/i];

/** Heuristic flag shown to the teacher; never blocks grading. */
export function injectionSuspected(text: string): boolean {
  return INJECTION.some((r) => r.test(text));
}
