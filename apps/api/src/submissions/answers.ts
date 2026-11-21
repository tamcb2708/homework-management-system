import type { QuestionType } from '@prisma/client';
import { badRequest } from '../common/errors';
import type { Answer } from '../grading/engine';

const NODE_TYPES = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'hardBreak', 'horizontalRule', 'codeBlock']);
const MARK_TYPES = new Set(['bold', 'italic', 'strike', 'code', 'underline']);
const MAX_NODES = 5000;

/**
 * Allow-list sanitizer for rich-text (Tiptap JSON) answers – prevents stored XSS (S7).
 * Unknown nodes/marks/attributes are dropped; only heading.level survives as an attribute.
 */
export function sanitizeDoc(input: unknown): { doc: any; text: string } | null {
  let count = 0;
  const texts: string[] = [];
  const walk = (n: any): any | null => {
    if (!n || typeof n !== 'object' || typeof n.type !== 'string' || !NODE_TYPES.has(n.type)) return null;
    if (++count > MAX_NODES) throw badRequest('ANSWER_TOO_LARGE', 'Bài làm quá dài.');
    const out: any = { type: n.type };
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text) return null;
      out.text = n.text.slice(0, 20000);
      texts.push(out.text);
      if (Array.isArray(n.marks)) {
        const marks = n.marks.filter((m: any) => m && MARK_TYPES.has(m.type)).map((m: any) => ({ type: m.type }));
        if (marks.length) out.marks = marks;
      }
      return out;
    }
    if (n.type === 'heading') out.attrs = { level: [1, 2, 3].includes(n.attrs?.level) ? n.attrs.level : 2 };
    if (n.type === 'hardBreak') texts.push('\n');
    if (Array.isArray(n.content)) {
      const kids = n.content.map(walk).filter(Boolean);
      if (kids.length) out.content = kids;
    }
    if (['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(n.type)) texts.push('\n');
    return out;
  };
  const doc = walk(input);
  if (!doc || doc.type !== 'doc') return null;
  return { doc, text: texts.join('').replace(/\n{3,}/g, '\n\n').trim() };
}

export interface QuestionShape {
  id: string;
  type: QuestionType;
  config: any;
  options: { id: string }[];
}

/** Validates & normalises one answer against its question. File ownership is checked by the caller. */
export function sanitizeAnswer(q: QuestionShape, raw: any): Answer | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'object') throw badRequest('INVALID_ANSWER', 'Câu trả lời không hợp lệ.');
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE': {
      const sel = Array.isArray(raw.selected) ? [...new Set(raw.selected.filter((x: unknown) => typeof x === 'string'))] as string[] : [];
      const valid = new Set(q.options.map((o) => o.id));
      if (sel.some((s) => !valid.has(s))) throw badRequest('INVALID_ANSWER', 'Lựa chọn không hợp lệ.');
      if (q.type !== 'MULTIPLE_CHOICE' && sel.length > 1) throw badRequest('INVALID_ANSWER', 'Chỉ được chọn một đáp án.');
      return { selected: sel };
    }
    case 'SHORT_ANSWER': {
      const text = typeof raw.text === 'string' ? raw.text.slice(0, 1000) : '';
      return { text };
    }
    case 'ESSAY': {
      if (raw.doc !== undefined) {
        const s = sanitizeDoc(raw.doc);
        if (s) return { doc: s.doc, text: s.text.slice(0, 50000) };
      }
      const text = typeof raw.text === 'string' ? raw.text.slice(0, 50000) : '';
      return { text };
    }
    case 'FILE_UPLOAD': {
      const ids = Array.isArray(raw.fileIds) ? [...new Set(raw.fileIds.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x as string)))] as string[] : [];
      const max = Number(q.config?.maxFiles ?? 3);
      if (ids.length > max) throw badRequest('TOO_MANY_FILES', `Chỉ được nộp tối đa ${max} tệp.`);
      return { fileIds: ids };
    }
  }
}

export function answerText(type: QuestionType, a: Answer | undefined): string | null {
  if (!a) return null;
  if (type === 'SHORT_ANSWER' || type === 'ESSAY') return a.text ?? null;
  return null;
}
