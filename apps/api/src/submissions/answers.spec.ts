import { sanitizeAnswer, sanitizeDoc } from './answers';

describe('sanitizeDoc', () => {
  it('drops unknown nodes, marks and attributes (XSS defence)', () => {
    const r = sanitizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { onclick: 'x' }, content: [{ type: 'text', text: 'Xin chào', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
        { type: 'iframe', attrs: { src: 'https://evil' } },
        { type: 'heading', attrs: { level: 9, style: 'x' }, content: [{ type: 'text', text: 'Tiêu đề' }] },
      ],
    })!;
    expect(r.doc.content).toHaveLength(2);
    expect(r.doc.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Xin chào', marks: [{ type: 'bold' }] }] });
    expect(r.doc.content[1].attrs).toEqual({ level: 2 });
    expect(r.text).toContain('Xin chào');
    expect(JSON.stringify(r.doc)).not.toMatch(/javascript|iframe|onclick/);
  });
  it('rejects non-doc roots', () => {
    expect(sanitizeDoc({ type: 'paragraph' })).toBeNull();
    expect(sanitizeDoc('<script>')).toBeNull();
  });
});

describe('sanitizeAnswer', () => {
  const sc = { id: 'q', type: 'SINGLE_CHOICE' as const, config: {}, options: [{ id: 'a' }, { id: 'b' }] };
  it('accepts valid option ids only', () => {
    expect(sanitizeAnswer(sc, { selected: ['a'] })).toEqual({ selected: ['a'] });
    expect(() => sanitizeAnswer(sc, { selected: ['zzz'] })).toThrow();
    expect(() => sanitizeAnswer(sc, { selected: ['a', 'b'] })).toThrow();
  });
  it('limits file count', () => {
    const f = { id: 'q', type: 'FILE_UPLOAD' as const, config: { maxFiles: 1 }, options: [] };
    const id = '3f1c2b8e-1111-4c4c-9a9a-123456789abc';
    expect(sanitizeAnswer(f, { fileIds: [id] })).toEqual({ fileIds: [id] });
    expect(() => sanitizeAnswer(f, { fileIds: [id, id.replace('1111', '2222')] })).toThrow();
  });
  it('truncates text answers', () => {
    const s = { id: 'q', type: 'SHORT_ANSWER' as const, config: {}, options: [] };
    expect((sanitizeAnswer(s, { text: 'x'.repeat(5000) }) as any).text).toHaveLength(1000);
  });
});
