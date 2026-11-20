'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ClipboardCheck, Play, RefreshCcw, Timer, TriangleAlert, User } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FileChips } from '@/components/content/answer-view';
import { ResultView } from '@/components/student/result-view';
import { WorkArea } from '@/components/student/work-area';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/ui/blocks';
import { useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtRelative, fmtScore, PHASE, STUDENT_STATUS } from '@/lib/format';

export default function StudentAssignment() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [version, setVersion] = useState<number | undefined>();
  const [starting, setStarting] = useState(false);
  const d = useQuery({ queryKey: ['student-assignment', id], queryFn: () => api<any>(`/api/student/assignments/${id}`) });
  const hasResult = !!d.data?.submission?.hasResult;
  const result = useQuery({ queryKey: ['student-result', d.data?.submission?.id, version], enabled: hasResult, queryFn: () => api<any>(`/api/student/submissions/${d.data.submission.id}/result${version ? `?version=${version}` : ''}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['student-assignment', id] }); qc.invalidateQueries({ queryKey: ['student-assignments'] }); qc.invalidateQueries({ queryKey: ['student-dashboard'] }); };
  if (d.isLoading) return <LoadingBlock rows={8} />;
  if (d.error) return <ErrorState error={d.error} onRetry={() => d.refetch()} />;
  const { assignment: a, submission: s, actions } = d.data;
  const st = STUDENT_STATUS[actions.status];
  const working = s?.rawStatus === 'IN_PROGRESS' && actions.canStart;

  const start = async () => {
    if (a.timeLimitMinutes && !s && !(await confirm({ title: 'Bắt đầu làm bài?', description: `Bài có giới hạn ${a.timeLimitMinutes} phút. Đồng hồ bắt đầu chạy ngay khi em bấm "Bắt đầu".`, confirmText: 'Bắt đầu' }))) return;
    setStarting(true);
    try { const r = await api(`/api/student/assignments/${id}/start`, { method: 'POST', body: {} }); qc.setQueryData(['student-assignment', id], r); }
    catch (e) { toast.error(errorMessage(e)); refresh(); } finally { setStarting(false); }
  };

  return (
    <>
      <PageHeader back={{ href: '/student/assignments', label: 'Bài tập của tôi' }}
        title={a.title}
        description={<span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Badge tone="primary">{a.subject.name}</Badge>
          <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{a.teacher}</span>
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Hạn {fmtDateTime(a.closeAt)}{a.phase !== 'CLOSED' && ` (${fmtRelative(a.closeAt)})`}</span>
          {a.timeLimitMinutes && <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{a.timeLimitMinutes} phút</span>}
          <span>{fmtScore(a.maxScore)} điểm</span>
        </span>}
        actions={<Badge tone={st.tone} className="text-sm">{st.label}</Badge>} />

      {working ? (
        <WorkArea key={`${s.id}-${s.draftRevision}`} detail={d.data} onSubmitted={refresh} onStale={refresh} />
      ) : (
        <div className="space-y-4">
          {(a.description || a.instructions || a.attachments.length > 0) && (
            <Card className="space-y-3 p-5 text-[15px]">
              {a.description && <p className="whitespace-pre-line">{a.description}</p>}
              {a.instructions && <p className="whitespace-pre-line text-ink-muted"><b>Hướng dẫn:</b> {a.instructions}</p>}
              <FileChips files={a.attachments} />
            </Card>
          )}
          {s?.returnedReason && actions.status === 'RETURNED' && (
            <Card className="flex gap-3 border-amber-200 bg-warning-soft p-5 text-sm"><TriangleAlert className="h-5 w-5 shrink-0 text-warning" /><div><div className="font-medium">Giáo viên yêu cầu nộp lại</div><p>{s.returnedReason}</p>{s.returnedDueAt && <p className="text-ink-soft">Hạn nộp lại: {fmtDateTime(s.returnedDueAt)}</p>}</div></Card>
          )}
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="text-sm">
              {!s && (actions.canStart ? <>Bài gồm <b>{a.questions.length} câu hỏi</b>. Bài làm được tự động lưu trong khi làm.</> : a.phase === 'CLOSED' ? 'Bài tập đã hết hạn nộp.' : 'Bài tập chưa mở.')}
              {s && ['SUBMITTED', 'GRADED'].includes(actions.status) && <span className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-success" /> Đã nộp lần {s.versions[0]?.versionNo} lúc {fmtDateTime(s.versions[0]?.submittedAt)}{s.versions[0]?.isLate && <Badge tone="warning">Muộn</Badge>}{actions.status === 'SUBMITTED' && ' · Đang chờ giáo viên chấm.'}</span>}
              {s && actions.status === 'MISSING' && 'Em chưa nộp bài trước hạn.'}
              {s?.rawStatus === 'IN_PROGRESS' && !actions.canStart && 'Đã hết thời gian làm bài. Bài làm sẽ được hệ thống tự nộp.'}
            </div>
            <div className="flex gap-2">
              {!s && actions.canStart && <Button size="lg" icon={<Play className="h-4 w-4" />} loading={starting} onClick={start} data-testid="start-assignment">Bắt đầu làm bài</Button>}
              {s?.rawStatus === 'RETURNED' && actions.canStart && <Button size="lg" icon={<RefreshCcw className="h-4 w-4" />} loading={starting} onClick={start}>Làm lại bài</Button>}
              {actions.canResubmit && <Button variant="outline" icon={<RefreshCcw className="h-4 w-4" />} loading={starting} onClick={async () => (await confirm({ title: 'Nộp lại bài?', description: `Em đã nộp ${s.attemptCount}/${a.maxAttempts} lần. Bài làm trước được giữ lại trong lịch sử; điểm tính theo lần nộp cuối.` })) && start()}>Nộp lại</Button>}
            </div>
          </Card>
          {s?.versions.length > 0 && (
            <Card className="p-5 text-sm"><div className="mb-2 font-medium">Lịch sử nộp bài</div>
              <ul className="space-y-1 text-ink-muted">{s.versions.map((v: any) => <li key={v.versionNo}>Lần {v.versionNo}: {fmtDateTime(v.submittedAt)}{v.isLate ? ' · muộn' : ''}{v.source === 'AUTO_TIMEOUT' ? ' · tự nộp khi hết giờ' : ''}</li>)}</ul>
            </Card>
          )}
          {hasResult && (result.isLoading ? <LoadingBlock /> : result.error ? <ErrorState error={result.error} /> : result.data && <ResultView r={result.data} onVersion={setVersion} />)}
          {a.phase && !s && <p className="text-center text-xs text-ink-faint">{PHASE[a.phase].label}</p>}
        </div>
      )}
    </>
  );
}
