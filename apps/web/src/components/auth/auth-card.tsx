import type { ReactNode } from 'react';
import { BookOpenCheck } from 'lucide-react';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><BookOpenCheck className="h-5 w-5" /></div>
          <div>
            <div className="font-semibold leading-tight">Homework Management</div>
            <div className="text-xs text-ink-soft">Giao bài · Nộp bài · Chấm điểm</div>
          </div>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-[13px] text-ink-soft">{footer}</div>}
      </div>
    </div>
  );
}
