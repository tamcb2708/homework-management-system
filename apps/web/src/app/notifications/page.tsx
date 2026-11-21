'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { NAV } from '@/components/shell/role-shell';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, Tabs } from '@/components/ui/blocks';
import { Button, Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useLogout, useRequireRole } from '@/lib/auth';
import { fmtDateTime, ROLE_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

interface N { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

export default function NotificationsPage() {
  const { me, ready, error } = useRequireRole('ANY');
  const logout = useLogout();
  const role = (['SCHOOL_ADMIN', 'TEACHER', 'STUDENT'] as const).find((r) => me?.roles.includes(r)) ?? 'STUDENT';
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ['notifications', tab, page], enabled: ready, queryFn: () => api<{ items: N[]; total: number; page: number; pageSize: number; unreadCount: number }>(`/api/notifications?page=${page}${tab === 'unread' ? '&unread=true' : ''}`) });
  const refresh = () => ['notifications', 'notif-count', 'notif-latest'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const read = useMutation({ mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: 'POST', body: {} }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api('/api/notifications/read-all', { method: 'POST', body: {} }), onSuccess: refresh });
  return (
    <AppShell nav={NAV[role]} roleLabel={ROLE_LABEL[role]} userName={me?.fullName} orgName={me?.tenant.name} onLogout={() => logout()} ready={ready} error={error}>
      <PageHeader title="Thông báo" description="Các sự kiện liên quan đến bài tập và điểm số của bạn."
        actions={<Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} disabled={!q.data?.unreadCount} loading={readAll.isPending} onClick={() => readAll.mutate()}>Đánh dấu đã đọc tất cả</Button>} />
      <div className="mb-3"><Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: 'all', label: 'Tất cả' }, { value: 'unread', label: 'Chưa đọc', count: q.data?.unreadCount }]} /></div>
      <Card>
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState title="Không có thông báo" /> : (
          <ul className="divide-y divide-line">
            {q.data.items.map((n) => (
              <li key={n.id}>
                <button className={cn('flex w-full gap-3 px-5 py-3.5 text-left hover:bg-slate-50', !n.readAt && 'bg-primary-soft/30')} onClick={() => { if (!n.readAt) read.mutate(n.id); if (n.link) router.push(n.link); }}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-slate-200' : 'bg-primary')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-[13px] text-ink-soft">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{fmtDateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />}
      </Card>
    </AppShell>
  );
}
