'use client';
import * as DM from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpenCheck, ChevronDown, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/blocks';
import { NotificationBell } from './notification-bell';

export interface NavItem { href: string; label: string; icon: LucideIcon; exact?: boolean }

export function AppShell({ nav, roleLabel, userName, orgName, onLogout, children, ready, error, showBell = true }: {
  nav: NavItem[]; roleLabel: string; userName?: string; orgName?: string; onLogout: () => void; children: ReactNode; ready: boolean; error?: unknown; showBell?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));
  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Điều hướng chính">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white"><BookOpenCheck className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-ink">Homework</div>
          <div className="truncate text-[12px] text-ink-soft">{orgName ?? 'Management System'}</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i) ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', active(i) ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-slate-100 hover:text-ink')}>
            <i.icon className="h-[18px] w-[18px] shrink-0" /> {i.label}
          </Link>
        ))}
      </div>
      <div className="border-t border-line px-5 py-3 text-[11px] text-ink-faint">{roleLabel}</div>
    </nav>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-pop">
            <button className="absolute right-3 top-4 rounded-lg p-1.5 text-ink-soft hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Đóng menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
        <button className="rounded-xl p-2 text-ink-muted hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
        <div className="flex-1" />
        {showBell && ready && <NotificationBell />}
        <DM.Root>
          <DM.Trigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100" data-testid="user-menu">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary">{initial(userName)}</span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[180px] truncate text-[13px] font-medium text-ink">{userName}</span>
              <span className="block text-[11px] text-ink-soft">{roleLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-ink-faint" />
          </DM.Trigger>
          <DM.Portal>
            <DM.Content align="end" sideOffset={8} className="z-50 min-w-[200px] rounded-xl border border-line bg-white p-1 shadow-pop">
              <DM.Item onSelect={onLogout} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink outline-none hover:bg-slate-50 focus:bg-slate-50">
                <LogOut className="h-4 w-4" /> Đăng xuất
              </DM.Item>
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {error ? <ErrorState error={error} onRetry={() => location.reload()} /> : ready ? children : <div className="flex justify-center py-24"><Spinner className="h-7 w-7" /></div>}
      </main>
    </div>
  );
}

function initial(name?: string) {
  const words = (name ?? '?').replace(/\(.*?\)/g, '').trim().split(/\s+/);
  return (words[words.length - 1]?.[0] ?? '?').toUpperCase();
}
