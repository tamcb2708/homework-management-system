'use client';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, ClipboardList, Hourglass, PenLine, Send, Shapes, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingStats, PageHeader, ProgressBar, StatCard } from '@/components/ui/blocks';
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime, fmtRelative, PHASE } from '@/lib/format';

export default function TeacherDashboard() {
  const q = useQuery({ queryKey: ['teacher-dashboard'], queryFn: () => api<any>('/api/teacher/dashboard') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Tổng quan giảng dạy" actions={<Link href="/teacher/assignments?new=1"><Button icon={<PenLine className="h-4 w-4" />}>Tạo bài tập</Button></Link>} />
      {!d ? <LoadingStats n={8} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Lớp đang dạy" value={d.classes} icon={<Shapes className="h-5 w-5" />} />
          <StatCard label="Học sinh" value={d.students} icon={<Users className="h-5 w-5" />} tone="info" />
          <StatCard label="Bài tập đã giao" value={d.byStatus.PUBLISHED + d.byStatus.ARCHIVED} hint={`${d.byStatus.DRAFT} nháp · ${d.byStatus.SCHEDULED} đã lên lịch`} icon={<ClipboardList className="h-5 w-5" />} tone="neutral" />
          <StatCard label="Chưa đến hạn" value={d.notYetDue} icon={<CalendarClock className="h-5 w-5" />} tone="info" />
          <StatCard label="Chờ chấm" value={d.pendingGrading} icon={<Hourglass className="h-5 w-5" />} tone="warning" />
          <StatCard label="Chờ công bố" value={d.pendingPublish} icon={<Send className="h-5 w-5" />} tone="primary" />
          <StatCard label="Đã công bố điểm" value={d.graded} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
          <StatCard label="Tỷ lệ hoàn thành" value={d.completionRate === null ? '—' : `${d.completionRate}%`} icon={<TrendingUp className="h-5 w-5" />} tone="success" />
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Cần xử lý" description="Bài nộp chờ chấm hoặc chờ công bố điểm." />
          {d && !d.needsAction.length ? <EmptyState title="Không có việc tồn đọng" description="Tất cả bài nộp đã được chấm và công bố." /> : (
            <ul className="divide-y divide-line">
              {d?.needsAction.map((a: any) => (
                <li key={a.id}>
                  <Link href={`/teacher/assignments/${a.id}/submissions`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0"><span className="block truncate font-medium">{a.title}</span><span className="text-[13px] text-ink-soft">{a.subject} · {a.submitted}/{a.recipients} đã nộp</span></span>
                    <span className="flex shrink-0 gap-1.5">{a.toGrade > 0 && <Badge tone="warning">{a.toGrade} chờ chấm</Badge>}{a.toPublish > 0 && <Badge tone="primary">{a.toPublish} chờ công bố</Badge>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Thống kê điểm" description="Điểm trung bình (theo % tổng điểm) của các bài đã công bố." />
          {d && !d.scoreStats.length ? <EmptyState title="Chưa có điểm được công bố" /> : (
            <div className="space-y-3 p-5">
              {d?.scoreStats.map((s: any) => (
                <div key={s.id} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm"><span className="truncate">{s.title}</span><span className="shrink-0 tabular-nums text-ink-soft">{s.averagePercent}% · {s.count} HS</span></div>
                  <ProgressBar value={s.averagePercent} tone={s.averagePercent >= 50 ? 'success' : 'warning'} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Bài tập đang mở" />
          {d && !d.upcoming.length ? <EmptyState title="Không có bài tập đang mở" /> : (
            <ul className="divide-y divide-line">
              {d?.upcoming.map((a: any) => (
                <li key={a.id}>
                  <Link href={`/teacher/assignments/${a.id}/submissions`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0"><span className="block font-medium">{a.title}</span><span className="text-[13px] text-ink-soft">Hạn: {fmtDateTime(a.dueAt)} ({fmtRelative(a.dueAt)})</span></span>
                    <span className="flex w-48 items-center gap-2"><ProgressBar value={a.recipients ? (a.submitted / a.recipients) * 100 : 0} /><span className="text-xs tabular-nums text-ink-soft">{a.submitted}/{a.recipients}</span></span>
                    <Badge tone={PHASE[a.phase].tone}>{PHASE[a.phase].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
