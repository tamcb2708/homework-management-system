'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/api';
import { Button, Card, Input, Skeleton } from './primitives';

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 space-y-2">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-primary">
          <ChevronLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, hint, tone = 'primary' }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  const t = { primary: 'bg-primary-soft text-primary', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info', neutral: 'bg-slate-100 text-slate-600' }[tone];
  return (
    <Card className="flex items-start gap-3 p-4">
      {icon && <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', t)}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-[13px] text-ink-soft">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-ink-soft">{hint}</div>}
      </div>
    </Card>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-faint">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"><AlertTriangle className="h-6 w-6" /></div>
      <p className="font-medium text-ink">Không tải được dữ liệu</p>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">{errorMessage(error)}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Thử lại</Button>}
    </div>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function LoadingStats({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-2xl" />)}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium transition', value === i.value ? 'bg-white text-primary shadow-card ring-1 ring-line' : 'text-ink-soft hover:bg-white/60 hover:text-ink')}>
          {i.label}
          {i.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px]', value === i.value ? 'bg-primary-soft' : 'bg-slate-200/70')}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Tìm kiếm…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-soft">
      <span>Trang {page}/{pages} · {total} mục</span>
      <div className="flex gap-1">
        <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/** Simple responsive table: horizontal scroll on small screens. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50/60 text-[12px] font-medium uppercase tracking-wide text-ink-soft">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium first:pl-5 last:pr-5">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-4 py-3 align-middle first:pl-5 last:pr-5', className)}>{children}</td>;
}

export function ProgressBar({ value, tone = 'primary' }: { value: number | null; tone?: 'primary' | 'success' | 'warning' }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const c = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-amber-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', c)} style={{ width: `${v}%` }} />
    </div>
  );
}
