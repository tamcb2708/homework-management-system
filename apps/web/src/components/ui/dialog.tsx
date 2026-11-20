'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './primitives';

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-pop focus:outline-none', w)}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[13px] text-ink-soft">{description}</D.Description> : <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>}
            </div>
            <D.Close className="rounded-lg p-1 text-ink-soft hover:bg-slate-100" aria-label="Đóng"><X className="h-5 w-5" /></D.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmOpts { title: string; description?: ReactNode; confirmText?: string; tone?: 'primary' | 'danger' }
const Ctx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((res) => { resolver.current = res; setOpts(o); }), []);
  const close = (v: boolean) => { resolver.current?.(v); setOpts(null); };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(v) => !v && close(false)} title={opts?.title ?? ''} size="sm"
        footer={<><Button variant="outline" onClick={() => close(false)}>Hủy</Button><Button variant={opts?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>{opts?.confirmText ?? 'Xác nhận'}</Button></>}>
        {opts?.description && <div className="text-sm text-ink-muted">{opts.description}</div>}
      </Dialog>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
