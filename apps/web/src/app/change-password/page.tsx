'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/auth-card';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useLogout, useMe } from '@/lib/auth';
import { homeFor } from '@/lib/format';

const schema = z.object({
  currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
  newPassword: z.string().min(8, 'Tối thiểu 8 ký tự').max(128),
  confirm: z.string(),
}).refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Mật khẩu nhập lại không khớp' });

export default function ChangePasswordPage() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const logout = useLogout();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (me.error?.status === 401) { router.replace('/login'); return null; }
  return (
    <AuthCard title="Đổi mật khẩu" subtitle={me.data?.mustChangePassword ? 'Bạn đang dùng mật khẩu tạm thời. Vui lòng đặt mật khẩu mới để tiếp tục.' : 'Đặt mật khẩu mới cho tài khoản của bạn.'}
      footer={<button className="hover:text-primary" onClick={() => logout()}>Đăng xuất</button>}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
        setError(null);
        try {
          await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
          toast.success('Đã đổi mật khẩu.');
          await qc.invalidateQueries({ queryKey: ['me'] });
          router.replace(homeFor(me.data?.roles ?? []));
        } catch (e) { setError(errorMessage(e)); }
      })}>
        <Field label="Mật khẩu hiện tại" error={errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...register('currentPassword')} /></Field>
        <Field label="Mật khẩu mới" error={errors.newPassword?.message} hint="Ít nhất 8 ký tự, không chứa tên đăng nhập hoặc mã học sinh."><Input type="password" autoComplete="new-password" {...register('newPassword')} /></Field>
        <Field label="Nhập lại mật khẩu mới" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        {error && <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">{error}</div>}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Lưu mật khẩu mới</Button>
      </form>
    </AuthCard>
  );
}
