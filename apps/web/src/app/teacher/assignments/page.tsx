'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, SearchInput, Table, Tabs, Td } from '@/components/ui/blocks';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { ASSIGNMENT_STATUS, fmtDateTime, PHASE } from '@/lib/format';

type Tab = '' | 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'REVOKED' | 'ARCHIVED';

function List() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['teacher-assignments', tab, q], queryFn: () => api<any[]>(`/api/teacher/assignments?${new URLSearchParams({ ...(tab ? { status: tab } : {}), ...(q ? { q } : {}) })}`) });
  const teaching = useQuery({ queryKey: ['teaching'], queryFn: () => api<any>('/api/teacher/teaching') });
  useEffect(() => { if (params.get('new')) setOpen(true); }, [params]);
  useEffect(() => { if (!subjectId && teaching.data?.subjects[0]) setSubjectId(teaching.data.subjects[0].id); }, [teaching.data, subjectId]);
  const create = async () => {
    if (title.trim().length < 3) return toast.error('Tiêu đề tối thiểu 3 ký tự.');
    setBusy(true);
    try { const a = await api<any>('/api/teacher/assignments', { method: 'POST', body: { title: title.trim(), subjectId } }); router.push(`/teacher/assignments/${a.id}`); }
    catch (e) { toast.error(errorMessage(e)); setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Bài tập" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)} disabled={!teaching.data?.subjects.length}>Tạo bài tập</Button>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: '', label: 'Tất cả' }, { value: 'DRAFT', label: 'Nháp' }, { value: 'SCHEDULED', label: 'Đã lên lịch' }, { value: 'PUBLISHED', label: 'Đang giao' }, { value: 'REVOKED', label: 'Đã thu hồi' }, { value: 'ARCHIVED', label: 'Lưu trữ' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Tìm bài tập…" className="w-full sm:w-72" />
      </div>
      <Card>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.length ? (
          <EmptyState title="Chưa có bài tập" description="Tạo bài tập, thêm câu hỏi rồi giao cho lớp." action={<Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Tạo bài tập</Button>} />
        ) : (
          <Table head={['Bài tập', 'Trạng thái', 'Lớp', 'Hạn nộp', 'Đã nộp', 'Cần xử lý', '']}>
            {list.data.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60">
                <Td><Link href={`/teacher/assignments/${a.id}`} className="font-medium hover:text-primary">{a.title}</Link><div className="text-xs text-ink-soft">{a.subject.name} · {a.questionCount} câu · {a.maxScore} điểm</div></Td>
                <Td><div className="flex flex-wrap gap-1"><Badge tone={ASSIGNMENT_STATUS[a.status].tone}>{ASSIGNMENT_STATUS[a.status].label}</Badge>{a.phase && a.phase !== 'OPEN' && <Badge tone={PHASE[a.phase].tone}>{PHASE[a.phase].label}</Badge>}</div></Td>
                <Td className="text-[13px]">{a.targets.join(', ') || '—'}</Td>
                <Td className="whitespace-nowrap text-[13px] text-ink-soft">{fmtDateTime(a.dueAt)}</Td>
                <Td>{a.status === 'DRAFT' ? '—' : <div className="flex w-32 items-center gap-2"><ProgressBar value={a.recipients ? (a.submitted / a.recipients) * 100 : 0} /><span className="text-xs tabular-nums text-ink-soft">{a.submitted}/{a.recipients}</span></div>}</Td>
                <Td><div className="flex gap-1">{a.toGrade > 0 && <Badge tone="warning">{a.toGrade} chờ chấm</Badge>}{a.toPublish > 0 && <Badge tone="primary">{a.toPublish} chờ công bố</Badge>}</div></Td>
                <Td className="text-right">{a.status !== 'DRAFT' && <Link href={`/teacher/assignments/${a.id}/submissions`} className="text-[13px] font-medium text-primary hover:underline">Bài nộp</Link>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title="Tạo bài tập mới" size="sm" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button loading={busy} onClick={create}>Tạo và soạn câu hỏi</Button></>}>
        <div className="space-y-4">
          <Field label="Tiêu đề" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Bài tập Chương 3" autoFocus onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <Field label="Môn học" required hint="Chỉ các môn bạn được phân công."><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{teaching.data?.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
      </Dialog>
    </>
  );
}

export default function Page() { return <Suspense><List /></Suspense>; }
