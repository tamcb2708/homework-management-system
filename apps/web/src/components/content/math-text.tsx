'use client';
import katex from 'katex';
import { Fragment, useMemo } from 'react';

/**
 * Renders plain text with inline $…$ and block $$…$$ formulas (QST-07).
 * Text is rendered as React text nodes (no HTML injection); KaTeX output uses trust:false and is self-generated markup.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => split(text ?? ''), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) => p.math
        ? <span key={i} className={p.block ? 'my-2 block overflow-x-auto' : ''} dangerouslySetInnerHTML={{ __html: render(p.value, p.block) }} /> // eslint-disable-line react/no-danger -- KaTeX markup, trust:false
        : <Fragment key={i}>{p.value.split('\n').map((line, j, arr) => <Fragment key={j}>{line}{j < arr.length - 1 && <br />}</Fragment>)}</Fragment>)}
    </span>
  );
}

function render(tex: string, block: boolean) {
  try { return katex.renderToString(tex, { displayMode: block, throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200 }); }
  catch { return tex.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }
}

function split(s: string) {
  const out: { value: string; math: boolean; block: boolean }[] = [];
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ value: s.slice(last, m.index), math: false, block: false });
    out.push({ value: m[1] ?? m[2], math: true, block: !!m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ value: s.slice(last), math: false, block: false });
  return out;
}
