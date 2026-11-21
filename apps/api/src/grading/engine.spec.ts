import { answerKeyProblem, gradeAuto, GradableQuestion, isEmptyAnswer, normalizeShort, totalIfComplete } from './engine';

const opts = (correct: number[], n = 4) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, isCorrect: correct.includes(i) }));

describe('gradeAuto', () => {
  it('single choice: full points only for the correct option', () => {
    const q: GradableQuestion = { type: 'SINGLE_CHOICE', points: 2, config: {}, options: opts([1]) };
    expect(gradeAuto(q, { selected: ['o1'] })).toEqual({ status: 'AUTO_GRADED', score: 2 });
    expect(gradeAuto(q, { selected: ['o0'] })).toEqual({ status: 'AUTO_GRADED', score: 0 });
    expect(gradeAuto(q, { selected: ['o1', 'o0'] })).toEqual({ status: 'AUTO_GRADED', score: 0 });
    expect(gradeAuto(q, undefined)).toEqual({ status: 'AUTO_GRADED', score: 0 });
  });

  it('true/false behaves like single choice', () => {
    const q: GradableQuestion = { type: 'TRUE_FALSE', points: 1, config: {}, options: opts([0], 2) };
    expect(gradeAuto(q, { selected: ['o0'] })).toEqual({ status: 'AUTO_GRADED', score: 1 });
    expect(gradeAuto(q, { selected: ['o1'] })).toEqual({ status: 'AUTO_GRADED', score: 0 });
  });

  it('multiple choice all-or-nothing', () => {
    const q: GradableQuestion = { type: 'MULTIPLE_CHOICE', points: 3, config: {}, options: opts([0, 2]) };
    expect(gradeAuto(q, { selected: ['o0', 'o2'] }).status).toBe('AUTO_GRADED');
    expect((gradeAuto(q, { selected: ['o2', 'o0'] }) as any).score).toBe(3);
    expect((gradeAuto(q, { selected: ['o0'] }) as any).score).toBe(0);
    expect((gradeAuto(q, { selected: ['o0', 'o2', 'o3'] }) as any).score).toBe(0);
  });

  it('multiple choice partial credit penalises wrong picks and never goes negative', () => {
    const q: GradableQuestion = { type: 'MULTIPLE_CHOICE', points: 4, config: { scoring: 'PARTIAL' }, options: opts([0, 1, 2]) };
    expect((gradeAuto(q, { selected: ['o0', 'o1'] }) as any).score).toBe(2.67);
    expect((gradeAuto(q, { selected: ['o0', 'o1', 'o2'] }) as any).score).toBe(4);
    expect((gradeAuto(q, { selected: ['o0', 'o3'] }) as any).score).toBe(0);
    expect((gradeAuto(q, { selected: ['o3'] }) as any).score).toBe(0);
  });

  it('short answer matches with normalisation, keeps diacritics by default (O-16)', () => {
    const q: GradableQuestion = { type: 'SHORT_ANSWER', points: 1, config: { accepted: ['Hà Nội'] }, options: [] };
    expect(gradeAuto(q, { text: '  hà   nội ' })).toEqual({ status: 'AUTO_GRADED', score: 1 });
    expect(gradeAuto(q, { text: 'Ha Noi' })).toEqual({ status: 'NEEDS_MANUAL' });
    const q2 = { ...q, config: { accepted: ['Hà Nội'], ignoreDiacritics: true } };
    expect(gradeAuto(q2, { text: 'ha noi' })).toEqual({ status: 'AUTO_GRADED', score: 1 });
  });

  it('short answer numeric tolerance and comma decimals', () => {
    const q: GradableQuestion = { type: 'SHORT_ANSWER', points: 2, config: { accepted: ['3.14'], numericTolerance: 0.01 }, options: [] };
    expect(gradeAuto(q, { text: '3,141' })).toEqual({ status: 'AUTO_GRADED', score: 2 });
    expect(gradeAuto(q, { text: '3.2' })).toEqual({ status: 'NEEDS_MANUAL' });
  });

  it('short answer without key or with zeroIfNoMatch', () => {
    expect(gradeAuto({ type: 'SHORT_ANSWER', points: 1, config: {}, options: [] }, { text: 'x' })).toEqual({ status: 'NEEDS_MANUAL' });
    expect(gradeAuto({ type: 'SHORT_ANSWER', points: 1, config: { accepted: ['a'], zeroIfNoMatch: true }, options: [] }, { text: 'b' })).toEqual({ status: 'AUTO_GRADED', score: 0 });
    expect(gradeAuto({ type: 'SHORT_ANSWER', points: 1, config: { accepted: ['a'] }, options: [] }, { text: '  ' })).toEqual({ status: 'AUTO_GRADED', score: 0 });
  });

  it('essays and file uploads always need a teacher (AI never auto-runs – D9.1)', () => {
    expect(gradeAuto({ type: 'ESSAY', points: 10, config: {}, options: [] }, { text: 'bài làm' })).toEqual({ status: 'NEEDS_MANUAL' });
    expect(gradeAuto({ type: 'FILE_UPLOAD', points: 5, config: {}, options: [] }, { fileIds: ['f'] })).toEqual({ status: 'NEEDS_MANUAL' });
  });
});

describe('answerKeyProblem', () => {
  it('validates choice keys', () => {
    expect(answerKeyProblem({ type: 'SINGLE_CHOICE', options: [{ isCorrect: true }, { isCorrect: true }], config: {} })).toMatch(/đúng 1/);
    expect(answerKeyProblem({ type: 'SINGLE_CHOICE', options: [{ isCorrect: true }, { isCorrect: false }], config: {} })).toBeNull();
    expect(answerKeyProblem({ type: 'MULTIPLE_CHOICE', options: [{ isCorrect: false }, { isCorrect: false }], config: {} })).toMatch(/ít nhất 1/);
    expect(answerKeyProblem({ type: 'TRUE_FALSE', options: [{ isCorrect: true }], config: {} })).toMatch(/2 lựa chọn/);
    expect(answerKeyProblem({ type: 'ESSAY', options: [], config: {} })).toBeNull();
  });
});

describe('helpers', () => {
  it('normalizeShort and isEmptyAnswer', () => {
    expect(normalizeShort(' Đà  Nẵng ', { ignoreDiacritics: true })).toBe('da nang');
    expect(isEmptyAnswer('ESSAY', { text: '  ' })).toBe(true);
    expect(isEmptyAnswer('MULTIPLE_CHOICE', { selected: ['a'] })).toBe(false);
  });
  it('totalIfComplete', () => {
    expect(totalIfComplete([{ earnedScore: 1.25 }, { earnedScore: 2 }])).toBe(3.25);
    expect(totalIfComplete([{ earnedScore: 1 }, { earnedScore: null }])).toBeNull();
  });
});
