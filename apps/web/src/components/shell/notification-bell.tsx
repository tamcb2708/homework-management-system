'use client';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

interface N { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; type: string }

export function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const count = useQuery({ queryKey: ['notif-count'], queryFn: () => api<{ count: number }>('/api/notifications/unread-count'), refetchInterval: 45_000 });
  const list = useQuery({ queryKey: ['notif-latest'], queryFn: () => api<{ items: N[] }>('/api/notifications?page=1'), enabled: false });
  const read = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: 'POST', body: {} }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notif-latest'] }); },
  });
  const readAll = useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'POST', body: {} }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notif-latest'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
  const unread = count.data?.count ?? 0;
  return (
    <DM.Root onOpenChange={(o) => o && list.refetch()}>
      <DM.Trigger className="relative rounded-xl p-2 text-ink-muted hover:bg-slate-100" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`} data-testid="notification-bell">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-[min(380px,calc(100vw-24px))] rounded-2xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Thông báo</span>
            <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>
              <CheckCheck className="h-3.5 w-3.5" /> Đánh dấu đã đọc tất cả
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto py-1">
            {list.isLoading && <p className="px-4 py-6 text-center text-sm text-ink-soft">Đang tải…</p>}
            {list.data?.items.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-soft">Chưa có thông báo nào.</p>}
            {list.data?.items.slice(0, 8).map((n) => (
              <DM.Item key={n.id} onSelect={() => { if (!n.readAt) read.mutate(n.id); if (n.link) router.push(n.link); }}
                className={cn('flex cursor-pointer gap-3 px-4 py-2.5 outline-none hover:bg-slate-50 focus:bg-slate-50', !n.readAt && 'bg-primary-soft/40')}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-ink-soft">{n.body}</span>}
                  <span className="block text-[11px] text-ink-faint">{fmtRelative(n.createdAt)}</span>
                </span>
              </DM.Item>
            ))}
          </div>
          <div className="border-t border-line px-4 py-2.5 text-center">
            <Link href="/notifications" className="text-[13px] font-medium text-primary hover:underline">Xem tất cả thông báo</Link>
          </div>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
