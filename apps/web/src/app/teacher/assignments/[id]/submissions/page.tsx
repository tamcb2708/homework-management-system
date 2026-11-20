'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, PenLine, Send, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, Table, Tabs, Td } from '@/components/ui/blocks';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtScore, fromLocalInput, PHASE, SUBMISSION_STATUS } from '@/lib/format';

export default function Roster() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['roster', id], queryFn: () => api<any>(`/api/teacher/assignments/${id}/roster`), refetchInterval: 30_000 });
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [ret, setRet] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <LoadingBlock rows={8} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const rows = d.rows.filter((r: any) => (filter === 'ALL' || (filter === 'LATE' ? r.isLate : r.status === filter)) && (!search || `${r.studentCode} ${r.fullName}`.toLowerCase().includes(search.toLowerCase())));
  const statuses = ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'GRADING', 'GRADED', 'PUBLISHED', 'RETURNED', 'MISSING'].filter((s) => d.counts[s]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['roster', id] }); qc.invalidateQueries({ queryKey: ['teacher-dashboard'] }); };
  return (
    <>
      <PageHeader back={{ href: `/teacher/assignments/${id}`, label: 'Về bài tập' }} title={d.assignment.title}
        description={<span>Hạn nộp {fmtDateTime(d.assignment.dueAt)} {d.assignment.phase && <Badge tone={PHASE[d.assignment.phase].tone} className="ml-1">{PHASE[d.assignment.phase].label}</Badge>}</span>}
        actions={<>
          <a href={`/api/teacher/assignments/${id}/export.xlsx`}><Button variant="outline" icon={<Download className="h-4 w-4" />}>Xuất Excel</Button></a>
          <Button icon={<Send className="h-4 w-4" />} disabled={!d.counts.GRADED} data-testid="publish-all" onClick={async () => {
            if (!(await confirm({ title: `Công bố điểm cho ${d.counts.GRADED} bài đã chấm?`, description: 'Học sinh sẽ nhận thông báo và xem được điểm, nhận xét.' }))) return;
            try { const r = await api<any>(`/api/teacher/assignments/${id}/publish-grades`, { method: 'POST', body: {} }); toast.success(`Đã công bố ${r.published.length} bài`); refresh(); } catch (e) { toast.error(errorMessage(e)); }
          }}>Công bố điểm ({d.counts.GRADED ?? 0})</Button>
        </>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onChange={setFilter} items={[{ value: 'ALL', label: 'Tất cả', count: d.rows.length }, ...statuses.map((s) => ({ value: s, label: SUBMISSION_STATUS[s].label, count: d.counts[s] })), ...(d.late ? [{ value: 'LATE', label: 'Nộp muộn', count: d.late }] : [])]} />
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm học sinh…" className="w-full sm:w-64" />
      </div>
      <Card>
        {!rows.length ? <EmptyState title="Không có học sinh phù hợp" /> : (
          <Table head={['Mã HS', 'Họ tên', 'Lớp', 'Trạng thái', 'Nộp lúc', 'Lần nộp', 'Điểm', '']}>
            {rows.map((r: any) => (
              <tr key={r.studentId}>
                <Td className="font-medium">{r.studentCode}</Td><Td>{r.fullName}</Td><Td className="text-[13px]">{r.classes.join(', ')}</Td>
                <Td><div className="flex flex-wrap gap-1"><Badge tone={SUBMISSION_STATUS[r.status].tone}>{SUBMISSION_STATUS[r.status].label}</Badge>{r.isLate && <Badge tone="warning">Nộp muộn</Badge>}</div></Td>
                <Td className="whitespace-nowrap text-[13px] text-ink-soft">{fmtDateTime(r.submittedAt)}</Td>
                <Td>{r.versionNo ?? '—'}</Td>
                <Td className="tabular-nums">{r.earnedScore !== null ? `${fmtScore(r.earnedScore)}/${fmtScore(d.assignment.maxScore)}` : '—'}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    {r.submissionId && r.versionNo && <Link href={`/teacher/grading/${r.submissionId}`}><Button size="sm" variant={['SUBMITTED', 'GRADING'].includes(r.status) ? 'primary' : 'outline'} icon={<PenLine className="h-3.5 w-3.5" />} data-testid={`grade-${r.studentCode}`}>{['SUBMITTED', 'GRADING'].includes(r.status) ? 'Chấm' : 'Xem'}</Button></Link>}
                    {!['IN_PROGRESS', 'RETURNED'].includes(r.status) && d.assignment.status === 'PUBLISHED' && <Button size="sm" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => { setRet(r); setReason(''); setDue(''); }}>Yêu cầu nộp lại</Button>}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={!!ret} onOpenChange={(v) => !v && setRet(null)} title={`Yêu cầu ${ret?.fullName ?? ''} nộp lại`} size="sm"
        footer={<><Button variant="outline" onClick={() => setRet(null)}>Hủy</Button><Button loading={busy} disabled={reason.trim().length < 3} onClick={async () => {
          setBusy(true);
          try { await api(`/api/teacher/assignments/${id}/return`, { method: 'POST', body: { studentId: ret.studentId, reason, dueAt: fromLocalInput(due) } }); toast.success('Đã gửi yêu cầu nộp lại'); setRet(null); refresh(); }
          catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}>Gửi yêu cầu</Button></>}>
        <div className="space-y-4">
          <Field label="Lý do" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Bổ sung phần lời giải câu 2" /></Field>
          <Field label="Hạn nộp lại" hint={d.assignment.phase === 'CLOSED' ? 'Bắt buộc vì bài đã hết hạn.' : 'Để trống: theo hạn của bài tập.'}><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
      </Dialog>
    </>
  );
}
