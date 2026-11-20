'use client';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, GraduationCap, Inbox, Library, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingStats, PageHeader, ProgressBar, StatCard } from '@/components/ui/blocks';
import { Badge, Card, CardHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { ASSIGNMENT_STATUS, fmtDateTime } from '@/lib/format';

export default function AdminDashboard() {
  const q = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => api<any>('/api/admin/dashboard') });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const total = d ? Object.values(d.assignmentsByStatus as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <PageHeader title="Tổng quan trường" description="Số liệu cập nhật theo thời gian thực." />
      {!d ? <LoadingStats n={8} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Giáo viên" value={d.teachers} icon={<Users className="h-5 w-5" />} />
          <StatCard label="Học sinh" value={d.students} icon={<GraduationCap className="h-5 w-5" />} tone="success" />
          <StatCard label="Lớp học" value={d.classes} icon={<Building2 className="h-5 w-5" />} tone="info" />
          <StatCard label="Môn học" value={d.subjects} icon={<Library className="h-5 w-5" />} tone="neutral" />
          <StatCard label="Bài tập" value={d.assignments} icon={<ClipboardList className="h-5 w-5" />} tone="warning" />
          <StatCard label="Lượt nộp bài" value={d.submissions} icon={<Inbox className="h-5 w-5" />} />
          <StatCard label="Tỷ lệ hoàn thành" value={d.completionRate === null ? '—' : `${d.completionRate}%`} icon={<TrendingUp className="h-5 w-5" />} tone="success" hint="Bài đã nộp / bài được giao" />
          <Link href="/admin/audit?sensitive=true"><StatCard label="Truy cập nhạy cảm" value="Xem" icon={<ShieldAlert className="h-5 w-5" />} tone="danger" hint="Nhật ký truy cập bài làm" /></Link>
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bài tập theo trạng thái" />
          <div className="space-y-3 p-5">
            {d && Object.entries(d.assignmentsByStatus as Record<string, number>).map(([k, v]) => (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-sm"><span>{ASSIGNMENT_STATUS[k]?.label ?? k}</span><span className="tabular-nums text-ink-soft">{v}</span></div>
                <ProgressBar value={total ? (v / total) * 100 : 0} />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Hoạt động gần đây" action={<Link href="/admin/audit" className="text-[13px] font-medium text-primary hover:underline">Xem tất cả</Link>} />
          {d && !d.recentActivity.length ? <EmptyState title="Chưa có hoạt động" /> : (
            <ul className="divide-y divide-line">
              {d?.recentActivity.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate"><span className="font-medium">{a.actor}</span> · <code className="text-xs text-ink-soft">{a.action}</code> {a.isSensitive && <Badge tone="danger">nhạy cảm</Badge>}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{fmtDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
