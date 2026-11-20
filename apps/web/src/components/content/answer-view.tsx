'use client';
import { CheckCircle2, Circle, Download, FileText, XCircle } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { RichTextView } from './rich-text';

export interface ViewOption { id: string; content: string; isCorrect?: boolean }
export interface ViewFile { id: string; name: string; size: number }

/** Displays a submitted answer by question type; shows correctness only when `isCorrect` is provided. */
export function AnswerView({ type, answer, options = [], files = [] }: { type: string; answer: any; options?: ViewOption[]; files?: ViewFile[] }) {
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(type)) {
    const sel: string[] = answer?.selected ?? [];
    return (
      <ul className="space-y-1.5">
        {options.map((o) => {
          const chosen = sel.includes(o.id);
          const known = o.isCorrect !== undefined;
          return (
            <li key={o.id} className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm',
              chosen ? (known ? (o.isCorrect ? 'border-emerald-200 bg-success-soft' : 'border-red-200 bg-danger-soft') : 'border-primary/30 bg-primary-soft') : known && o.isCorrect ? 'border-emerald-200 border-dashed' : 'border-line')}>
              {chosen ? (known && !o.isCorrect ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', known ? 'text-success' : 'text-primary')} />) : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />}
              <span className="flex-1">{o.content}</span>
              {known && o.isCorrect && <span className="text-xs font-medium text-success">Đáp án đúng</span>}
              {chosen && <span className="text-xs text-ink-soft">Đã chọn</span>}
            </li>
          );
        })}
        {!sel.length && <li className="text-sm text-ink-faint">(Không chọn đáp án)</li>}
      </ul>
    );
  }
  if (type === 'FILE_UPLOAD') {
    return files.length ? (
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li key={f.id}><a href={fileUrl(f.id)} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-primary hover:text-primary">
            <FileText className="h-4 w-4" /> {f.name} <span className="text-xs text-ink-faint">{fmtBytes(f.size)}</span> <Download className="h-4 w-4" />
          </a></li>
        ))}
      </ul>
    ) : <span className="text-sm text-ink-faint">(Không nộp tệp)</span>;
  }
  if (type === 'ESSAY') return <div className="rounded-xl bg-slate-50 p-3"><RichTextView doc={answer?.doc} text={answer?.text} /></div>;
  return answer?.text ? <div className="rounded-xl bg-slate-50 px-3 py-2 text-[15px]">{answer.text}</div> : <span className="text-sm text-ink-faint">(Không trả lời)</span>;
}

export function FileChips({ files }: { files: ViewFile[] }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.id} href={fileUrl(f.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] hover:border-primary hover:text-primary">
          <FileText className="h-4 w-4" /> {f.name} <span className="text-ink-faint">{fmtBytes(f.size)}</span>
        </a>
      ))}
    </div>
  );
}
