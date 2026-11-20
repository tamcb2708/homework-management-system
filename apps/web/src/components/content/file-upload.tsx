'use client';
import { Loader2, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage, uploadFile } from '@/lib/api';
import { fmtBytes } from '@/lib/format';
import type { ViewFile } from './answer-view';

export function FileUpload({ files, onChange, purpose, max = 5, disabled, accept = '.pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png' }: {
  files: ViewFile[]; onChange: (f: ViewFile[]) => void; purpose: 'ASSIGNMENT_ATTACHMENT' | 'QUESTION_MEDIA' | 'ANSWER_UPLOAD'; max?: number; disabled?: boolean; accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-ink-soft" /><span className="truncate">{f.name}</span><span className="text-xs text-ink-faint">{fmtBytes(f.size)}</span></span>
          {!disabled && <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="rounded p-1 text-ink-soft hover:bg-slate-100" aria-label={`Bỏ ${f.name}`}><X className="h-4 w-4" /></button>}
        </div>
      ))}
      {!disabled && files.length < max && (
        <>
          <input ref={ref} type="file" className="hidden" accept={accept} data-testid={`file-input-${purpose}`} onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setBusy(true);
            try { const up = await uploadFile(file, purpose); onChange([...files, up]); toast.success(`Đã tải lên ${up.name}`); }
            catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
          }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-ink-soft hover:border-primary hover:text-primary disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} {busy ? 'Đang tải lên…' : `Chọn tệp (tối đa ${max}) – PDF, DOCX, XLSX, PPTX, JPG, PNG`}
          </button>
        </>
      )}
    </div>
  );
}
