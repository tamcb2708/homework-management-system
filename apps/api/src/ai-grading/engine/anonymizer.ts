/**
 * Removes identifying information before any text could leave the system (D11.4, D11.5, ai-grading-design §5).
 * Fail-closed: callers must not send anything if this throws.
 */
export interface IdentityTerms {
  studentFullName?: string;
  studentCode?: string;
  teacherNames?: string[];
  schoolName?: string;
  classCodes?: string[];
}

export interface RedactionResult {
  text: string;
  summary: Record<string, number>;
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds a diacritic/case-insensitive regex for a phrase with word boundaries. */
function phraseRegex(phrase: string): RegExp | null {
  const words = strip(phrase).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.map(esc).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
}

export function redact(input: string, ids: IdentityTerms): RedactionResult {
  const summary: Record<string, number> = {};
  // Work on a diacritic-stripped shadow to find spans, then cut the same spans from the original (lengths match after NFC→NFD? no) –
  // so instead we normalise the text itself to NFC and match on a stripped copy with an index map.
  const original = input.normalize('NFC');
  const chars = [...original];
  const shadow = chars.map((c) => strip(c).charAt(0) || c).join('');
  const spans: { start: number; end: number; label: string }[] = [];
  const add = (re: RegExp | null, label: string, onShadow = true) => {
    if (!re) return;
    const hay = onShadow ? shadow : chars.join('');
    for (const m of hay.matchAll(re)) {
      const start = [...hay.slice(0, m.index!)].length;
      spans.push({ start, end: start + [...m[0]].length, label });
    }
  };
  const name = ids.studentFullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    add(phraseRegex(name), 'HỌC_SINH');
    if (parts.length >= 3) add(phraseRegex(parts.slice(-2).join(' ')), 'HỌC_SINH'); // tên đệm + tên
    if (parts.length >= 2) add(phraseRegex(`${parts[0]} ${parts[parts.length - 1]}`), 'HỌC_SINH'); // họ + tên
  }
  if (ids.studentCode) add(phraseRegex(ids.studentCode), 'MÃ_HS');
  for (const t of ids.teacherNames ?? []) add(phraseRegex(t), 'GIÁO_VIÊN');
  if (ids.schoolName) add(phraseRegex(ids.schoolName), 'TRƯỜNG');
  for (const c of ids.classCodes ?? []) if (c.length >= 2) add(phraseRegex(c), 'LỚP');
  add(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'EMAIL', false);
  add(/(?<!\d)(?:\+84|0)[\s.-]?(?:3|5|7|8|9)(?:[\s.-]?\d){8}(?!\d)/g, 'SĐT', false);
  add(/(?<!\d)\d{12}(?!\d)|(?<!\d)\d{9}(?!\d)/g, 'SỐ_ĐỊNH_DANH', false);
  add(/https?:\/\/\S+/g, 'URL', false);

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: string[] = [];
  let i = 0;
  for (const s of spans) {
    if (s.start < i) continue; // overlapping – first (longest) wins
    out.push(chars.slice(i, s.start).join(''), `[${s.label}]`);
    summary[s.label] = (summary[s.label] ?? 0) + 1;
    i = s.end;
  }
  out.push(chars.slice(i).join(''));
  return { text: out.join(''), summary };
}
