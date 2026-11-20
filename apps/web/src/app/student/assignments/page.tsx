'use client';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Timer, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, Tabs } from '@/components/ui/blocks';
import { Badge, Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime, fmtRelative, fmtScore, STUDENT_STATUS } from '@/lib/format';

type F = 'all' | 'todo' | 'in_progress' | 'submitted' | 'graded' | 'overdue';

export default function StudentAssignments() {
  const [filter, setFilter] = useState<F>('all');
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['student-assignments', filter, q], queryFn: () => api<any[]>(`/api/student/assignments?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <>
      <PageHeader title="Bài tập của tôi" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onChange={setFilter} items={[{ value: 'all', label: 'Tất cả' }, { value: 'todo', label: 'Chưa làm' }, { value: 'in_progress', label: 'Đang làm' }, { value: 'submitted', label: 'Đã nộp' }, { value: 'graded', label: 'Đã chấm' }, { value: 'overdue', label: 'Quá hạn' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Tìm bài tập…" className="w-full sm:w-64" />
      </div>
      {list.isLoading ? <Card><LoadingBlock /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.length ? <Card><EmptyState title="Không có bài tập" description={filter === 'all' ? 'Khi giáo viên giao bài, bài tập sẽ xuất hiện ở đây.' : 'Không có bài tập ở trạng thái này.'} /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((a) => {
            const st = STUDENT_STATUS[a.status];
            const open = a.phase === 'OPEN' || a.phase === 'LATE_PERIOD';
            return (
              <Link key={a.id} href={`/student/assignments/${a.id}`} data-testid="assignment-card">
                <Card className="flex h-full flex-col gap-3 p-5 transition hover:border-primary/30 hover:shadow-pop">
                  <div className="flex items-start justify-between gap-2"><Badge tone="primary">{a.subject.name}</Badge><Badge tone={st.tone}>{st.label}</Badge></div>
                  <div className="font-semibold leading-snug">{a.title}</div>
                  <div className="mt-auto space-y-1 text-[13px] text-ink-soft">
                    <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {a.teacher}</div>
                    <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Giao {fmtDateTime(a.openAt)} · Hạn {fmtDateTime(a.closeAt)}</div>
                    {a.timeLimitMinutes && <div className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> {a.timeLimitMinutes} phút</div>}
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-3 text-[13px]">
                    <span className={open && ['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'].includes(a.status) ? 'font-medium text-warning' : 'text-ink-soft'}>{open ? fmtRelative(a.closeAt) : a.phase === 'CLOSED' ? 'Đã hết hạn' : ''}</span>
                    <span className="font-medium">{a.earnedScore !== null ? `${fmtScore(a.earnedScore)}/${fmtScore(a.maxScore)} điểm` : `${fmtScore(a.maxScore)} điểm`}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
