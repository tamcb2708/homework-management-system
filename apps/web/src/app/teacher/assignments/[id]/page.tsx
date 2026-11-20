'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, CheckCircle2, Copy, Download, Inbox, Lock, Pencil, Plus, RotateCcw, Send, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileChips, type ViewFile } from '@/components/content/answer-view';
import { FileUpload } from '@/components/content/file-upload';
import { MathText } from '@/components/content/math-text';
import { PublishDialog } from '@/components/teacher/publish-dialog';
import { QuestionDialog } from '@/components/teacher/question-dialog';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/blocks';
import { useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { ASSIGNMENT_STATUS, fmtDateTime, PHASE, QUESTION_TYPE } from '@/lib/format';

export default function AssignmentEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['assignment', id], queryFn: () => api<any>(`/api/teacher/assignments/${id}`) });
  const [qOpen, setQOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (a: any) => { qc.setQueryData(['assignment', id], a); qc.invalidateQueries({ queryKey: ['teacher-assignments'] }); };

  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  const locked = a.hasSubmissions;
  const editable = a.status !== 'ARCHIVED';

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try { const r = await fn(); if (r?.id) set(r); toast.success(ok); return r; } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  const actions = (
    <>
      {a.status !== 'DRAFT' && <Link href={`/teacher/assignments/${id}/submissions`}><Button variant="outline" icon={<Inbox className="h-4 w-4" />}>Bài nộp</Button></Link>}
      {['DRAFT', 'SCHEDULED', 'PUBLISHED'].includes(a.status) && <Button icon={<Send className="h-4 w-4" />} onClick={() => setPubOpen(true)} data-testid="open-publish">{a.status === 'DRAFT' ? 'Giao bài' : 'Cập nhật giao bài'}</Button>}
      {['PUBLISHED', 'SCHEDULED'].includes(a.status) && <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} loading={busy === 'revoke'} onClick={async () => (await confirm({ title: 'Thu hồi bài tập?', description: 'Học sinh sẽ không còn thấy bài. Bài nộp và điểm được giữ nguyên; có thể khôi phục.', tone: 'danger', confirmText: 'Thu hồi' })) && run('revoke', () => api(`/api/teacher/assignments/${id}/revoke`, { method: 'POST', body: {} }), 'Đã thu hồi bài tập')}>Thu hồi</Button>}
      {a.status === 'REVOKED' && <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={busy === 'restore'} onClick={() => run('restore', () => api(`/api/teacher/assignments/${id}/restore`, { method: 'POST', body: {} }), 'Đã khôi phục bài tập')}>Khôi phục</Button>}
      {(a.status === 'REVOKED' || a.phase === 'CLOSED') && <Button variant="ghost" icon={<Archive className="h-4 w-4" />} loading={busy === 'archive'} onClick={async () => (await confirm({ title: 'Lưu trữ bài tập?', description: 'Bài tập chuyển sang chỉ đọc.' })) && run('archive', () => api(`/api/teacher/assignments/${id}/archive`, { method: 'POST', body: {} }), 'Đã lưu trữ')}>Lưu trữ</Button>}
      <Button variant="ghost" icon={<Copy className="h-4 w-4" />} loading={busy === 'dup'} onClick={async () => { const r = await run('dup', () => api(`/api/teacher/assignments/${id}/duplicate`, { method: 'POST', body: {} }), 'Đã tạo bản sao'); if (r?.id) router.push(`/teacher/assignments/${r.id}`); }}>Nhân bản</Button>
      {a.status !== 'DRAFT' && <a href={`/api/teacher/assignments/${id}/export.xlsx`}><Button variant="ghost" icon={<Download className="h-4 w-4" />}>Excel</Button></a>}
      {a.status === 'DRAFT' && <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
        if (!(await confirm({ title: 'Xóa bài tập nháp?', tone: 'danger', confirmText: 'Xóa' }))) return;
        try { await api(`/api/teacher/assignments/${id}`, { method: 'DELETE' }); toast.success('Đã xóa'); qc.invalidateQueries({ queryKey: ['teacher-assignments'] }); router.replace('/teacher/assignments'); } catch (e) { toast.error(errorMessage(e)); }
      }}>Xóa</Button>}
    </>
  );

  return (
    <>
      <PageHeader back={{ href: '/teacher/assignments', label: 'Bài tập' }}
        title={<span className="flex flex-wrap items-center gap-2">{a.title} <Badge tone={ASSIGNMENT_STATUS[a.status].tone}>{ASSIGNMENT_STATUS[a.status].label}</Badge>{a.phase && <Badge tone={PHASE[a.phase].tone}>{PHASE[a.phase].label}</Badge>}</span>}
        description={`${a.subject.name} · ${a.questions.length} câu hỏi · Tổng ${a.maxScore} điểm${a.passScore !== null ? ` · Đạt từ ${a.passScore}` : ''}`} actions={actions} />

      {a.status !== 'DRAFT' && (
        <Card className="mb-6 grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="text-ink-soft">Mở bài</div><div className="font-medium">{fmtDateTime(a.openAt)}</div></div>
          <div><div className="text-ink-soft">Hạn nộp</div><div className="font-medium">{fmtDateTime(a.dueAt)}</div></div>
          <div><div className="text-ink-soft">Nộp muộn</div><div className="font-medium">{a.allowLate ? `Đến ${fmtDateTime(a.lateUntil)}` : 'Không cho phép'}</div></div>
          <div><div className="text-ink-soft">Đối tượng</div><div className="font-medium">{a.targets.map((t: any) => t.label).join(', ') || '—'}</div></div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Câu hỏi" description={locked ? 'Đã có học sinh nộp bài – cấu trúc câu hỏi bị khóa (vẫn sửa được nội dung và đáp án).' : 'Thêm câu hỏi, sắp xếp thứ tự và đặt điểm.'}
            action={editable && !locked && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setQOpen(true); }} data-testid="add-question">Thêm câu hỏi</Button>} />
          {!a.questions.length ? <EmptyState title="Chưa có câu hỏi" description="Bài tập cần ít nhất một câu hỏi trước khi giao." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setQOpen(true); }}>Thêm câu hỏi</Button>} /> : (
            <ol className="divide-y divide-line">
              {a.questions.map((qq: any, i: number) => (
                <li key={qq.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[13px] font-semibold">{qq.ordinal}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="info">{QUESTION_TYPE[qq.type]}</Badge><Badge>{qq.points} điểm</Badge>{!qq.isRequired && <Badge>Không bắt buộc</Badge>}{qq.rubric && <Badge tone="primary">Rubric {qq.rubric.criteria.length} tiêu chí{qq.rubric.locked ? ' · đã khóa' : ''}</Badge>}</div>
                      <div className="text-[15px]"><MathText text={qq.content} /></div>
                      {qq.options.length > 0 && (
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {qq.options.map((o: any, j: number) => <li key={o.id} className={`flex items-center gap-1.5 text-[13px] ${o.isCorrect ? 'font-medium text-success' : 'text-ink-muted'}`}>{o.isCorrect && <CheckCircle2 className="h-3.5 w-3.5" />}{String.fromCharCode(65 + j)}. <MathText text={o.content} /></li>)}
                        </ul>
                      )}
                      {qq.type === 'SHORT_ANSWER' && qq.config.accepted?.length > 0 && <p className="text-[13px] text-success">Đáp án: {qq.config.accepted.join(' | ')}</p>}
                      <FileChips files={qq.attachments as ViewFile[]} />
                    </div>
                    {editable && (
                      <div className="flex shrink-0 gap-0.5">
                        {!locked && <Button size="icon" variant="ghost" aria-label="Lên" disabled={i === 0} onClick={() => run('order', () => api(`/api/teacher/assignments/${id}/questions/order`, { method: 'PUT', body: { questionIds: swap(a.questions.map((x: any) => x.id), i, i - 1) } }), 'Đã sắp xếp')}><ArrowUp className="h-4 w-4" /></Button>}
                        {!locked && <Button size="icon" variant="ghost" aria-label="Xuống" disabled={i === a.questions.length - 1} onClick={() => run('order', () => api(`/api/teacher/assignments/${id}/questions/order`, { method: 'PUT', body: { questionIds: swap(a.questions.map((x: any) => x.id), i, i + 1) } }), 'Đã sắp xếp')}><ArrowDown className="h-4 w-4" /></Button>}
                        <Button size="icon" variant="ghost" aria-label="Sửa câu hỏi" onClick={() => { setEditing(qq); setQOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        {!locked && <Button size="icon" variant="ghost" aria-label="Xóa câu hỏi" onClick={async () => (await confirm({ title: `Xóa câu ${qq.ordinal}?`, tone: 'danger', confirmText: 'Xóa' })) && run('del', () => api(`/api/teacher/questions/${qq.id}`, { method: 'DELETE' }), 'Đã xóa câu hỏi')}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <SettingsCard a={a} disabled={!editable} onSaved={set} />
      </div>
      <QuestionDialog open={qOpen} onOpenChange={setQOpen} assignmentId={id} question={editing} locked={locked} onSaved={set} />
      <PublishDialog open={pubOpen} onOpenChange={setPubOpen} assignment={a} onDone={set} />
    </>
  );
}

function swap(ids: string[], i: number, j: number) {
  const c = [...ids]; [c[i], c[j]] = [c[j], c[i]]; return c;
}

function SettingsCard({ a, disabled, onSaved }: { a: any; disabled: boolean; onSaved: (a: any) => void }) {
  const [f, setF] = useState<any>({});
  const [files, setFiles] = useState<ViewFile[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setF({ title: a.title, description: a.description ?? '', instructions: a.instructions ?? '', topic: a.topic ?? '', passScore: a.passScore ?? '', timeLimitMinutes: a.timeLimitMinutes ?? '', allowResubmit: a.allowResubmit, maxAttempts: a.maxAttempts, answerVisibility: a.answerVisibility, aiGradingAllowed: a.aiGradingAllowed, aiFeedbackVisible: a.aiFeedbackVisible });
    setFiles(a.attachments);
  }, [a]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, passScore: f.passScore === '' ? null : Number(f.passScore), timeLimitMinutes: f.timeLimitMinutes === '' ? null : Number(f.timeLimitMinutes), maxAttempts: Number(f.maxAttempts), attachmentFileIds: files.map((x) => x.id) };
      if (a.hasSubmissions && body.timeLimitMinutes === a.timeLimitMinutes) delete body.timeLimitMinutes;
      onSaved(await api(`/api/teacher/assignments/${a.id}`, { method: 'PATCH', body }));
      toast.success('Đã lưu thông tin bài tập');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const u = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <Card className="h-fit">
      <CardHeader title="Thông tin & cài đặt" />
      <div className="space-y-4 p-5">
        <Field label="Tiêu đề" required><Input value={f.title ?? ''} onChange={u('title')} disabled={disabled} /></Field>
        <Field label="Mô tả"><Textarea value={f.description ?? ''} onChange={u('description')} rows={3} disabled={disabled} /></Field>
        <Field label="Hướng dẫn làm bài"><Textarea value={f.instructions ?? ''} onChange={u('instructions')} rows={2} disabled={disabled} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chủ đề / chương"><Input value={f.topic ?? ''} onChange={u('topic')} disabled={disabled} /></Field>
          <Field label="Điểm đạt"><Input type="number" min={0} step={0.25} value={f.passScore ?? ''} onChange={u('passScore')} disabled={disabled} /></Field>
        </div>
        <Field label="Thời gian làm bài (phút)" hint={a.hasSubmissions ? 'Không đổi được khi đã có bài nộp.' : 'Để trống nếu không giới hạn.'}><Input type="number" min={1} value={f.timeLimitMinutes ?? ''} onChange={u('timeLimitMinutes')} disabled={disabled || a.hasSubmissions} /></Field>
        <div className="grid grid-cols-2 items-end gap-3">
          <Checkbox label="Cho phép nộp lại" checked={!!f.allowResubmit} onChange={u('allowResubmit')} disabled={disabled} />
          <Field label="Số lần nộp tối đa"><Input type="number" min={1} max={20} value={f.maxAttempts ?? 1} onChange={u('maxAttempts')} disabled={disabled || !f.allowResubmit} /></Field>
        </div>
        <Field label="Học sinh xem đáp án"><Select value={f.answerVisibility} onChange={u('answerVisibility')} disabled={disabled}>
          <option value="AFTER_PUBLISH">Sau khi công bố điểm</option><option value="AFTER_DUE">Sau hạn nộp</option><option value="AFTER_SUBMIT">Ngay sau khi nộp</option><option value="NEVER">Không hiển thị</option>
        </Select></Field>
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <Checkbox label="Cho phép AI hỗ trợ chấm (khi trường đã bật AI)" checked={!!f.aiGradingAllowed} onChange={u('aiGradingAllowed')} disabled={disabled} />
          <Checkbox label="Công bố nhận xét AI đã duyệt cho học sinh" checked={!!f.aiFeedbackVisible} onChange={u('aiFeedbackVisible')} disabled={disabled} />
          <p className="flex items-center gap-1.5 text-xs text-ink-soft"><Lock className="h-3.5 w-3.5" /> AI hiện đang TẮT trên hệ thống (D11).</p>
        </div>
        <Field label="Tài liệu đính kèm"><FileUpload files={files} onChange={setFiles} purpose="ASSIGNMENT_ATTACHMENT" max={10} disabled={disabled} /></Field>
        {!disabled && <Button className="w-full" loading={busy} onClick={save}>Lưu thông tin</Button>}
      </div>
    </Card>
  );
}
