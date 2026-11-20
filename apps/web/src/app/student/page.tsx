'use client';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, Award, BookOpen, CheckCircle2, ClipboardCheck, ListTodo, PencilLine, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingStats, PageHeader, ProgressBar, StatCard } from '@/components/ui/blocks';
import { Badge, Card, CardHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDateTime, fmtRelative, fmtScore, STUDENT_STATUS } from '@/lib/format';

export default function StudentDashboard() {
  const me = useMe();
  const q = useQuery({ queryKey: ['student-dashboard'], queryFn: () => api<any>('/api/student/dashboard') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title={`Xin chào, ${me.data?.fullName.split(' ').pop() ?? ''}`} description="Theo dõi bài tập và kết quả học tập của em." />
      {!d ? <LoadingStats n={6} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Được giao" value={d.total} icon={<BookOpen className="h-5 w-5" />} />
          <StatCard label="Cần làm" value={d.todo} icon={<ListTodo className="h-5 w-5" />} tone="warning" />
          <StatCard label="Đang làm" value={d.inProgress} icon={<PencilLine className="h-5 w-5" />} tone="info" />
          <StatCard label="Đã nộp" value={d.submitted} icon={<ClipboardCheck className="h-5 w-5" />} tone="neutral" />
          <StatCard label="Đã chấm" value={d.graded} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
          <StatCard label="Quá hạn" value={d.overdue} icon={<TriangleAlert className="h-5 w-5" />} tone="danger" />
        </div>
      )}
      {d && (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="p-5 xl:col-span-1">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success"><Award className="h-5 w-5" /></div><div><div className="text-[13px] text-ink-soft">Điểm trung bình</div><div className="text-2xl font-semibold">{d.averagePercent === null ? '—' : `${d.averagePercent}%`}</div></div></div>
            <div className="mt-5 space-y-1.5"><div className="flex justify-between text-sm"><span>Tiến độ hoàn thành</span><span className="tabular-nums text-ink-soft">{d.progress ?? 0}%</span></div><ProgressBar value={d.progress} tone="success" /></div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title={<span className="flex items-center gap-2"><AlarmClock className="h-4 w-4 text-warning" /> Sắp đến hạn</span>} description="Trong 3 ngày tới" />
            {!d.dueSoon.length ? <EmptyState title="Không có bài sắp đến hạn" /> : <AssignmentList items={d.dueSoon} />}
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Bài tập mới" action={<Link href="/student/assignments" className="text-[13px] font-medium text-primary hover:underline">Xem tất cả</Link>} />
            {!d.newAssignments.length ? <EmptyState title="Không có bài tập mới" /> : <AssignmentList items={d.newAssignments} />}
          </Card>
          <Card>
            <CardHeader title="Hoạt động gần đây" />
            {!d.recentActivity.length ? <EmptyState title="Chưa có hoạt động" /> : (
              <ul className="divide-y divide-line">{d.recentActivity.map((n: any) => <li key={n.id}>{n.link ? <Link href={n.link} className="block px-5 py-2.5 text-sm hover:bg-slate-50">{n.title}<span className="block text-xs text-ink-faint">{fmtRelative(n.createdAt)}</span></Link> : <div className="px-5 py-2.5 text-sm">{n.title}</div>}</li>)}</ul>
            )}
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader title="Điểm mới công bố" action={<Link href="/student/grades" className="text-[13px] font-medium text-primary hover:underline">Kết quả học tập</Link>} />
            {!d.recentGrades.length ? <EmptyState title="Chưa có điểm" /> : (
              <ul className="divide-y divide-line">{d.recentGrades.map((g: any) => <li key={g.id}><Link href={`/student/assignments/${g.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"><span><span className="block font-medium">{g.title}</span><span className="text-[13px] text-ink-soft">{g.subject}</span></span><span className="text-lg font-semibold tabular-nums">{fmtScore(g.earnedScore)}<span className="text-sm text-ink-soft">/{fmtScore(g.maxScore)}</span></span></Link></li>)}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function AssignmentList({ items }: { items: any[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id}><Link href={`/student/assignments/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
          <span className="min-w-0"><span className="block font-medium">{a.title}</span><span className="text-[13px] text-ink-soft">{a.subject} · Hạn {fmtDateTime(a.closeAt)} ({fmtRelative(a.closeAt)})</span></span>
          <Badge tone={STUDENT_STATUS[a.status].tone}>{STUDENT_STATUS[a.status].label}</Badge>
        </Link></li>
      ))}
    </ul>
  );
}
