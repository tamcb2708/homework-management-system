'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/auth-card';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

const schema = z.object({ email: z.string().email('Email không hợp lệ'), password: z.string().min(1, 'Nhập mật khẩu') });

export default function PlatformLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <AuthCard title="Quản trị nền tảng" subtitle="Khu vực dành cho Platform Admin." footer={<Link href="/login" className="hover:text-primary">Đăng nhập trường học</Link>}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
        setError(null);
        try { await api('/api/platform/auth/login', { method: 'POST', body: v }); router.replace('/platform'); } catch (e) { setError(errorMessage(e)); }
      })}>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="username" {...register('email')} /></Field>
        <Field label="Mật khẩu" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        {error && <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">{error}</div>}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} icon={<ShieldCheck className="h-4 w-4" />}>Đăng nhập</Button>
      </form>
    </AuthCard>
  );
}
