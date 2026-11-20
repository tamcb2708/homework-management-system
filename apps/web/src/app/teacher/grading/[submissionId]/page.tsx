'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronLeft, ChevronRight, History, Lock, Save, Send, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AnswerView } from '@/components/content/answer-view';
import { MathText } from '@/components/content/math-text';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/ui/blocks';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtScore, fromLocalInput, GRADE_ITEM_STATUS, QUESTION_TYPE, SUBMISSION_STATUS } from '@/lib/format';

const CHANGE: Record<string, string> = { AUTO_GRADED: 'Chấm tự động', MANUAL_SET: 'Chấm tay', AI_ACCEPTED: 'Chấp nhận AI', AI_MODIFIED: 'Sửa điểm AI', OVERRIDE_AUTO: 'Ghi đè điểm tự động', REGRADE_KEY_CHANGE: 'Chấm lại do sửa đáp án', PUBLISHED: 'Công bố', FEEDBACK_EDITED: 'Sửa nhận xét' };

export default function GradingWorkspace() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [version, setVersion] = useState<number | undefined>();
  const q = useQuery({ queryKey: ['grading', submissionId, version], queryFn: () => api<any>(`/api/teacher/submissions/${submissionId}${version ? `?version=${version}` : ''}`) });
  const [overall, setOverall] = useState('');
  const [savingFb, setSavingFb] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  useEffect(() => { setOverall(q.data?.grade?.teacherFeedback ?? ''); }, [q.data?.grade?.teacherFeedback]);
  const set = (d: any) => { qc.setQueryData(['grading', submissionId, version], d); qc.invalidateQueries({ queryKey: ['roster', d.assignment.id] }); };
  if (q.isLoading) return <LoadingBlock rows={10} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const g = d.grade;
  const readOnly = !d.version?.isLatest;
  return (
    <>
      <PageHeader back={{ href: `/teacher/assignments/${d.assignment.id}/submissions`, label: 'Danh sách bài nộp' }}
        title={`${d.submission.student.studentCode} · ${d.submission.student.fullName}`}
        description={<span className="flex flex-wrap items-center gap-2">{d.assignment.title} <Badge tone={SUBMISSION_STATUS[d.submission.status]?.tone}>{SUBMISSION_STATUS[d.submission.status]?.label}</Badge>{d.version?.isLate && <Badge tone="warning">Nộp muộn</Badge>}{d.version?.source === 'AUTO_TIMEOUT' && <Badge tone="info">Tự nộp khi hết giờ</Badge>}</span>}
        actions={<>
          {d.submission.versions.length > 1 && <Select value={d.version?.versionNo} onChange={(e) => setVersion(Number(e.target.value))} className="w-auto" aria-label="Phiên bản">{d.submission.versions.map((v: any) => <option key={v.versionNo} value={v.versionNo}>Lần nộp {v.versionNo} · {fmtDateTime(v.submittedAt)}</option>)}</Select>}
          <Button variant="outline" size="icon" aria-label="Học sinh trước" disabled={!d.nav.prev} onClick={() => router.push(`/teacher/grading/${d.nav.prev}`)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-[13px] text-ink-soft">{d.nav.position}/{d.nav.total}</span>
          <Button variant="outline" size="icon" aria-label="Học sinh tiếp theo" disabled={!d.nav.next} onClick={() => router.push(`/teacher/grading/${d.nav.next}`)}><ChevronRight className="h-4 w-4" /></Button>
        </>} />
      {readOnly && <div className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Đang xem phiên bản cũ (chỉ đọc). Điểm được tính theo phiên bản nộp cuối.</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {d.questions.map((qq: any) => (
            <Card key={qq.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Câu {qq.ordinal}</span><Badge tone="info">{QUESTION_TYPE[qq.type]}</Badge><Badge>{qq.points} điểm</Badge>
                {qq.grade && <Badge tone={GRADE_ITEM_STATUS[qq.grade.status].tone}>{GRADE_ITEM_STATUS[qq.grade.status].label}</Badge>}
              </div>
              <div className="mb-3 text-[15px]"><MathText text={qq.content} /></div>
              <AnswerView type={qq.type} answer={qq.answer} options={qq.options} files={qq.files} />
              {qq.type === 'SHORT_ANSWER' && qq.config?.accepted?.length > 0 && <p className="mt-2 text-[13px] text-success">Đáp án chấp nhận: {qq.config.accepted.join(' | ')}</p>}
              {qq.referenceAnswer && <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium text-ink-muted">Đáp án tham khảo</summary><p className="mt-1 whitespace-pre-line">{qq.referenceAnswer}</p></details>}
            </Card>
          ))}
        </div>
        <div className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <Card>
            <CardHeader title="Bảng điểm" action={g && <div className="text-right"><div className="text-2xl font-semibold tabular-nums" data-testid="total-score">{g.earnedScore === null ? '—' : fmtScore(g.earnedScore)}<span className="text-base text-ink-soft">/{fmtScore(g.maxScore)}</span></div>{g.passed !== null && <Badge tone={g.passed ? 'success' : 'danger'}>{g.passed ? 'Đạt' : 'Chưa đạt'}</Badge>}</div>} />
            <div className="divide-y divide-line">
              {d.questions.map((qq: any) => qq.grade && <ScoreRow key={qq.id} q={qq} step={d.scoreStep} published={g?.status === 'PUBLISHED'} disabled={readOnly} onSaved={set} />)}
            </div>
          </Card>
          <Card>
            <CardHeader title="Nhận xét chung" />
            <div className="space-y-3 p-5">
              <Textarea value={overall} onChange={(e) => setOverall(e.target.value)} rows={4} placeholder="Nhận xét cho học sinh…" disabled={readOnly || !g} data-testid="overall-feedback" />
              <Button variant="outline" size="sm" loading={savingFb} disabled={readOnly || !g || overall === (g?.teacherFeedback ?? '')} icon={<Save className="h-4 w-4" />} onClick={async () => {
                setSavingFb(true);
                try { set(await api(`/api/teacher/grades/${g.id}/feedback`, { method: 'PUT', body: { teacherFeedback: overall } })); toast.success('Đã lưu nhận xét'); } catch (e) { toast.error(errorMessage(e)); } finally { setSavingFb(false); }
              }}>Lưu nhận xét</Button>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-soft"><Bot className="h-5 w-5" /></div>
              <div className="text-sm">
                <div className="font-medium">AI hỗ trợ chấm</div>
                <p className="text-ink-soft">{d.ai.enabled ? 'Sẵn sàng.' : d.ai.gates.find((x: any) => !x.open)?.reason}</p>
                <Button size="sm" variant="outline" className="mt-2" icon={<Lock className="h-3.5 w-3.5" />} disabled>Chấm bằng AI</Button>
              </div>
            </div>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" icon={<Send className="h-4 w-4" />} disabled={readOnly || g?.status !== 'GRADED'} data-testid="publish-grade" onClick={async () => {
              if (!(await confirm({ title: 'Công bố điểm cho học sinh này?', description: 'Học sinh sẽ nhận thông báo và xem được điểm, nhận xét.' }))) return;
              try { const r = await api<any>('/api/teacher/grades/publish', { method: 'POST', body: { gradeIds: [g.id] } }); if (r.skipped.length) toast.error(r.skipped[0].reason); else toast.success('Đã công bố điểm'); q.refetch(); qc.invalidateQueries({ queryKey: ['roster', d.assignment.id] }); } catch (e) { toast.error(errorMessage(e)); }
            }}>{g?.status === 'PUBLISHED' ? 'Đã công bố' : 'Công bố điểm'}</Button>
            <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={readOnly || ['IN_PROGRESS', 'RETURNED'].includes(d.submission.status)} onClick={() => setRetOpen(true)}>Yêu cầu nộp lại</Button>
          </div>
          {g?.history?.length > 0 && (
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><History className="h-4 w-4" /> Lịch sử điểm</span>} />
              <ul className="max-h-64 divide-y divide-line overflow-y-auto text-[13px]">
                {g.history.map((h: any) => (
                  <li key={h.id} className="px-5 py-2">
                    <div className="flex justify-between gap-2"><span className="font-medium">{CHANGE[h.changeType] ?? h.changeType}{h.questionId ? ` · Câu ${d.questions.find((x: any) => x.id === h.questionId)?.ordinal}` : ''}</span><span className="text-ink-faint">{fmtDateTime(h.createdAt)}</span></div>
                    <div className="text-ink-soft">{h.actor}{h.newScore !== null ? ` · ${h.oldScore !== null ? `${fmtScore(h.oldScore)} → ` : ''}${fmtScore(h.newScore)}` : ''}{h.reason ? ` · ${h.reason}` : ''}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <ReturnDialog open={retOpen} onOpenChange={setRetOpen} assignmentId={d.assignment.id} studentId={d.submission.student.id} closed={d.assignment.phase === 'CLOSED'} onDone={() => { q.refetch(); qc.invalidateQueries({ queryKey: ['roster', d.assignment.id] }); }} />
      <div className="mt-6 text-center"><Link href={`/teacher/assignments/${d.assignment.id}/submissions`} className="text-[13px] text-primary hover:underline">← Về danh sách bài nộp</Link></div>
    </>
  );
}

function ScoreRow({ q, step, published, disabled, onSaved }: { q: any; step: number; published: boolean; disabled: boolean; onSaved: (d: any) => void }) {
  const gr = q.grade;
  const [score, setScore] = useState<string>(gr.earnedScore ?? '');
  const [crit, setCrit] = useState<Record<string, string>>({});
  const [fb, setFb] = useState(gr.feedback ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setScore(gr.earnedScore ?? ''); setFb(gr.feedback ?? ''); setReason('');
    setCrit(Object.fromEntries((q.rubric ?? []).map((c: any) => [c.id, String(gr.criteria.find((x: any) => x.criterionId === c.id)?.score ?? '')])));
  }, [gr, q.rubric]);
  const needsReason = published || gr.source === 'AUTO';
  const total = q.rubric ? Math.round(q.rubric.reduce((s: number, c: any) => s + Number(crit[c.id] || 0), 0) * 100) / 100 : Number(score);
  const changed = q.rubric ? q.rubric.some((c: any) => String(gr.criteria.find((x: any) => x.criterionId === c.id)?.score ?? '') !== crit[c.id]) || fb !== (gr.feedback ?? '') : String(gr.earnedScore ?? '') !== String(score) || fb !== (gr.feedback ?? '');
  const save = async () => {
    setBusy(true);
    try {
      const body: any = { feedback: fb || null };
      if (q.rubric) body.criteria = q.rubric.map((c: any) => ({ criterionId: c.id, score: Number(crit[c.id] || 0) }));
      else body.score = Number(score);
      if (needsReason && reason.trim()) body.reason = reason.trim();
      onSaved(await api(`/api/teacher/grade-details/${gr.detailId}`, { method: 'PUT', body }));
      toast.success(`Đã lưu điểm câu ${q.ordinal}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 px-5 py-4" data-testid={`score-row-${q.ordinal}`}>
      <div className="flex items-center justify-between text-sm"><span className="font-medium">Câu {q.ordinal}</span><span className="tabular-nums text-ink-soft">{gr.earnedScore === null ? 'Chưa chấm' : `${fmtScore(gr.earnedScore)}/${fmtScore(gr.maxScore)}`}</span></div>
      {q.rubric ? (
        <div className="space-y-1.5">
          {q.rubric.map((c: any) => (
            <div key={c.id} className="flex items-center gap-2 text-[13px]">
              <span className="flex-1" title={c.description ?? ''}>{c.name}</span>
              <Input type="number" min={0} max={c.maxPoints} step={step} value={crit[c.id] ?? ''} disabled={disabled} onChange={(e) => setCrit({ ...crit, [c.id]: e.target.value })} className="h-8 w-20 text-right" aria-label={`Điểm ${c.name}`} />
              <span className="w-10 text-ink-soft">/{c.maxPoints}</span>
            </div>
          ))}
          <div className="text-right text-[13px] text-ink-soft">Tổng: <b className="text-ink">{fmtScore(total)}</b>/{fmtScore(gr.maxScore)}</div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px]"><span className="flex-1">Điểm</span><Input type="number" min={0} max={gr.maxScore} step={step} value={score} disabled={disabled} onChange={(e) => setScore(e.target.value)} className="h-8 w-24 text-right" aria-label={`Điểm câu ${q.ordinal}`} /><span className="w-10 text-ink-soft">/{gr.maxScore}</span></div>
      )}
      <Textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={2} placeholder="Nhận xét cho câu này…" disabled={disabled} className="min-h-[60px] text-[13px]" />
      {needsReason && changed && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={published ? 'Lý do sửa điểm đã công bố (bắt buộc)' : 'Lý do ghi đè điểm tự động (bắt buộc nếu đổi điểm)'} className="h-9 text-[13px]" />}
      {!disabled && <Button size="sm" variant={changed ? 'primary' : 'outline'} loading={busy} disabled={!changed} onClick={save} icon={<Save className="h-3.5 w-3.5" />}>Lưu điểm</Button>}
    </div>
  );
}

function ReturnDialog({ open, onOpenChange, assignmentId, studentId, closed, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; assignmentId: string; studentId: string; closed: boolean; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Yêu cầu nộp lại" size="sm"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button loading={busy} disabled={reason.trim().length < 3} onClick={async () => {
        setBusy(true);
        try { await api(`/api/teacher/assignments/${assignmentId}/return`, { method: 'POST', body: { studentId, reason, dueAt: fromLocalInput(due) } }); toast.success('Đã gửi yêu cầu nộp lại'); onOpenChange(false); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Gửi yêu cầu</Button></>}>
      <div className="space-y-4">
        <Field label="Lý do" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Hạn nộp lại" hint={closed ? 'Bắt buộc vì bài đã hết hạn.' : 'Để trống: theo hạn của bài tập.'}><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
