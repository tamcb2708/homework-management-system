'use client';
import { Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/primitives';

/** Shows a temporary password ONCE (O-18). It is never stored client-side. */
export function TempPasswordDialog({ value, onClose }: { value: { username: string; password: string; note?: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()} title="Mật khẩu tạm thời" size="sm"
      description="Mật khẩu chỉ hiển thị MỘT lần. Người dùng sẽ phải đổi mật khẩu khi đăng nhập lần đầu."
      footer={<Button onClick={onClose}>Đã lưu, đóng</Button>}>
      {value && (
        <div className="space-y-3 text-sm">
          {value.note && <p className="text-ink-soft">{value.note}</p>}
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-ink-soft">Tên đăng nhập</div>
            <div className="font-medium">{value.username}</div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-primary-soft p-3">
            <div>
              <div className="text-xs text-ink-soft">Mật khẩu tạm</div>
              <div className="font-mono text-base font-semibold tracking-wide text-primary" data-testid="temp-password"><KeyRound className="mr-1 inline h-4 w-4" />{value.password}</div>
            </div>
            <Button size="sm" variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(value.password).then(() => toast.success('Đã sao chép'))}>Sao chép</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
