'use client';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Loader2, Send, Timer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ViewFile } from '@/components/content/answer-view';
import { FileChips } from '@/components/content/answer-view';
import { FileUpload } from '@/components/content/file-upload';
import { MathText } from '@/components/content/math-text';
import { RichTextEditor } from '@/components/content/rich-text';
import { ProgressBar } from '@/components/ui/blocks';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtDateTime, QUESTION_TYPE } from '@/lib/format';
import { cn, newIdempotencyKey } from '@/lib/utils';

type Answers = Record<string, any>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

const answered = (type: string, a: any) => {
  if (!a) return false;
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(type)) return !!a.selected?.length;
  if (type === 'FILE_UPLOAD') return !!a.fileIds?.length;
  return !!a.text?.trim();
};

/** Student work area (UC-63..65): autosave with revision, server-time countdown, required check, idempotent submit. */
export function WorkArea({ detail, onSubmitted, onStale }: { detail: any; onSubmitted: () => void; onStale: () => void }) {
  const a = detail.assignment;
  const sub = detail.submission;
  const storageKey = `hms.draft.${sub.id}`;
  const [answers, setAnswers] = useState<Answers>(() => sub.draft ?? {});
  const [files, setFiles] = useState<Record<string, ViewFile>>(() => Object.fromEntries((detail.draftFiles ?? []).map((f: ViewFile) => [f.id, f])));
  const [current, setCurrent] = useState(0);
  const [save, setSave] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(sub.draftUpdatedAt);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const revision = useRef<number>(sub.draftRevision);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef<Promise<void> | null>(null);
  const submitKey = useRef<string>(newIdempotencyKey());
  const offset = useMemo(() => new Date(detail.serverNow).getTime() - Date.now(), [detail.serverNow]);

  // Local backup (answers only – never tokens) in case the network drops (E8).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const b = JSON.parse(raw); if (b.revision >= revision.current && b.answers) { setAnswers(b.answers); dirty.current = true; schedule(); } }
    } catch { /* storage unavailable */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    if (inflight.current) { await inflight.current; if (!dirty.current) return; }
    dirty.current = false;
    setSave('saving');
    const body = { answers: answersRef.current, revision: revision.current };
    inflight.current = (async () => {
      try {
        const r = await api<{ revision: number; savedAt: string }>(`/api/student/submissions/${sub.id}/draft`, { method: 'PUT', body });
        revision.current = r.revision; setSavedAt(r.savedAt); setSave('saved');
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.code === 'STALE_DRAFT') { setSave('error'); toast.error(e.message); onStale(); }
        else if (e instanceof ApiError && ['NOT_EDITABLE', 'DEADLINE_PASSED', 'ASSIGNMENT_REVOKED'].includes(e.code)) { setSave('error'); toast.error(e.message); onStale(); }
        else { setSave(e instanceof TypeError ? 'offline' : 'error'); timer.current = setTimeout(() => void flush(), 5000); }
      } finally { inflight.current = null; }
    })();
    await inflight.current;
  }, [sub.id, storageKey, onStale]);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 2000);
  }, [flush]);

  const update = (qid: string, value: any) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: value };
      try { localStorage.setItem(storageKey, JSON.stringify({ revision: revision.current, answers: next })); } catch { /* ignore */ }
      return next;
    });
    dirty.current = true;
    setSave('idle');
    schedule();
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); if (timer.current) clearTimeout(timer.current); };
  }, []);

  // Countdown (server time)
  const deadline = sub.deadline ? new Date(sub.deadline).getTime() : null;
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(t); }, [offset]);
  const remaining = deadline ? deadline - now : null;
  const autoSubmitted = useRef(false);

  const doSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await flush();
      await api(`/api/student/submissions/${sub.id}/submit`, { method: 'POST', body: {}, headers: { 'Idempotency-Key': submitKey.current } });
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      toast.success('Đã nộp bài thành công.');
      setConfirmOpen(false);
      onSubmitted();
    } catch (e) {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.code === 'REQUIRED_MISSING') { const qn = (e.details as any)?.questions?.[0]; if (qn) setCurrent(a.questions.findIndex((x: any) => x.ordinal === qn)); setConfirmOpen(false); }
      if (e instanceof ApiError && ['ALREADY_SUBMITTED', 'DEADLINE_PASSED', 'ASSIGNMENT_REVOKED'].includes(e.code)) onSubmitted();
    } finally { setSubmitting(false); }
  }, [flush, sub.id, storageKey, onSubmitted, a.questions]);

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !autoSubmitted.current && a.timeLimitMinutes) {
      autoSubmitted.current = true;
      toast.warning('Hết thời gian làm bài – hệ thống đang nộp bài của em.');
      void doSubmit();
    }
  }, [remaining, doSubmit, a.timeLimitMinutes]);

  const qs = a.questions;
  const q = qs[current];
  const done = qs.filter((x: any) => answered(x.type, answers[x.id])).length;
  const missingRequired = qs.filter((x: any) => x.isRequired && !answered(x.type, answers[x.id]));
  const unanswered = qs.filter((x: any) => !answered(x.type, answers[x.id]));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Câu {q.ordinal}/{qs.length}</span>
            <Badge tone="info">{QUESTION_TYPE[q.type]}</Badge><Badge>{q.points} điểm</Badge>{q.isRequired && <Badge tone="warning">Bắt buộc</Badge>}
          </div>
          <div className="mb-4 text-[16px] leading-relaxed"><MathText text={q.content} /></div>
          <FileChips files={q.attachments} />
          {q.rubric && <p className="mb-3 mt-2 text-xs text-ink-soft">Tiêu chí chấm: {q.rubric.map((c: any) => `${c.name} (${c.maxPoints}đ)`).join(' · ')}</p>}
          <div className="mt-4"><AnswerInput q={q} value={answers[q.id]} files={files} onFiles={(f) => setFiles((p) => ({ ...p, ...Object.fromEntries(f.map((x) => [x.id, x])) }))} onChange={(v) => update(q.id, v)} /></div>
        </Card>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={current === 0} onClick={() => setCurrent(current - 1)}>Câu trước</Button>
          {current < qs.length - 1 ? <Button variant="secondary" onClick={() => { void flush(); setCurrent(current + 1); }} data-testid="next-question">Câu tiếp theo</Button>
            : <Button icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)} data-testid="open-submit">Nộp bài</Button>}
        </div>
      </div>
      <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        {remaining !== null && (
          <Card className={cn('p-4', remaining < 5 * 60_000 && 'border-red-200 bg-danger-soft')}>
            <div className="flex items-center gap-2 text-[13px] text-ink-soft"><Timer className="h-4 w-4" /> Thời gian còn lại</div>
            <div className={cn('mt-1 text-3xl font-semibold tabular-nums', remaining < 5 * 60_000 ? 'text-danger' : 'text-ink')} data-testid="countdown">{fmtCountdown(remaining)}</div>
          </Card>
        )}
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm"><span>Tiến độ</span><span className="tabular-nums text-ink-soft">{done}/{qs.length}</span></div>
          <div className="mt-2"><ProgressBar value={(done / qs.length) * 100} /></div>
          <div className="mt-4 grid grid-cols-6 gap-1.5">
            {qs.map((x: any, i: number) => (
              <button key={x.id} onClick={() => { void flush(); setCurrent(i); }} aria-label={`Câu ${x.ordinal}`} aria-current={i === current}
                className={cn('h-9 rounded-lg text-[13px] font-medium transition', i === current ? 'bg-primary text-white' : answered(x.type, answers[x.id]) ? 'bg-primary-soft text-primary' : 'bg-slate-100 text-ink-muted hover:bg-slate-200')}>{x.ordinal}</button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[13px]" aria-live="polite" data-testid="save-state">
            {save === 'saving' && <><Loader2 className="h-4 w-4 animate-spin text-primary" /> Đang lưu…</>}
            {save === 'saved' && <><Cloud className="h-4 w-4 text-success" /> Đã lưu nháp {savedAt ? fmtDateTime(savedAt).slice(-5) : ''}</>}
            {save === 'idle' && (savedAt ? <><Cloud className="h-4 w-4 text-ink-faint" /> Lưu lần cuối {fmtDateTime(savedAt).slice(-5)}</> : <span className="text-ink-faint">Bài làm được tự động lưu</span>)}
            {save === 'offline' && <><CloudOff className="h-4 w-4 text-warning" /> Mất kết nối – đang thử lại</>}
            {save === 'error' && <><AlertTriangle className="h-4 w-4 text-danger" /> Chưa lưu được</>}
          </div>
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { dirty.current = true; void flush(); }} data-testid="save-draft">Lưu nháp ngay</Button>
          <Button size="sm" className="mt-2 w-full" icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>Nộp bài</Button>
        </Card>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Xác nhận nộp bài" size="sm"
        description={sub.deadline ? `Hạn cuối: ${fmtDateTime(sub.deadline)}` : undefined}
        footer={<><Button variant="outline" onClick={() => setConfirmOpen(false)}>Làm tiếp</Button><Button loading={submitting} disabled={missingRequired.length > 0} onClick={doSubmit} data-testid="confirm-submit">Nộp bài</Button></>}>
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Đã trả lời {done}/{qs.length} câu.</p>
          {missingRequired.length > 0 && <p className="rounded-xl bg-danger-soft px-3 py-2 text-danger">Chưa trả lời câu bắt buộc: {missingRequired.map((x: any) => x.ordinal).join(', ')}.</p>}
          {!missingRequired.length && unanswered.length > 0 && <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">Còn {unanswered.length} câu không bắt buộc chưa trả lời: {unanswered.map((x: any) => x.ordinal).join(', ')}.</p>}
          <p className="text-ink-soft">{a.allowResubmit ? `Giáo viên cho phép nộp lại (tối đa ${a.maxAttempts} lần).` : 'Sau khi nộp, em không thể chỉnh sửa bài làm.'}</p>
        </div>
      </Dialog>
    </div>
  );
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function AnswerInput({ q, value, onChange, files, onFiles }: { q: any; value: any; onChange: (v: any) => void; files: Record<string, ViewFile>; onFiles: (f: ViewFile[]) => void }) {
  if (q.type === 'SINGLE_CHOICE' || q.type === 'TRUE_FALSE' || q.type === 'MULTIPLE_CHOICE') {
    const multi = q.type === 'MULTIPLE_CHOICE';
    const sel: string[] = value?.selected ?? [];
    return (
      <div className="space-y-2" role={multi ? 'group' : 'radiogroup'}>
        {multi && <p className="text-xs text-ink-soft">Chọn tất cả đáp án đúng.</p>}
        {q.options.map((o: any, i: number) => {
          const on = sel.includes(o.id);
          return (
            <label key={o.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-[15px] transition', on ? 'border-primary bg-primary-soft' : 'border-slate-200 hover:border-primary/40')}>
              <input type={multi ? 'checkbox' : 'radio'} name={q.id} checked={on} className="mt-1 h-4 w-4 accent-[#5a5fe0]" data-testid={`answer-option-${i}`}
                onChange={(e) => onChange({ selected: multi ? (e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id)) : [o.id] })} />
              <span className="font-medium text-ink-soft">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1"><MathText text={o.content} /></span>
            </label>
          );
        })}
      </div>
    );
  }
  if (q.type === 'SHORT_ANSWER') return <Input value={value?.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} placeholder="Nhập câu trả lời…" maxLength={1000} data-testid="answer-text" />;
  if (q.type === 'ESSAY') return <RichTextEditor value={value?.doc ?? (value?.text ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value.text }] }] } : null)} onChange={(doc, text) => onChange({ doc, text })} />;
  if (q.type === 'FILE_UPLOAD') {
    const ids: string[] = value?.fileIds ?? [];
    const list = ids.map((id) => files[id] ?? { id, name: 'Tệp đã tải lên', size: 0 });
    return <FileUpload files={list} purpose="ANSWER_UPLOAD" max={q.maxFiles ?? 3} onChange={(f) => { onFiles(f); onChange({ fileIds: f.map((x) => x.id) }); }} />;
  }
  return null;
}
