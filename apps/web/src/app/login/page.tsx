'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth/auth-card';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { homeFor } from '@/lib/format';

const schema = z.object({
  schoolCode: z.string().trim().min(1, 'Nhập mã trường').max(40),
  identifier: z.string().trim().min(1, 'Nhập mã học sinh, tên đăng nhập hoặc email').max(200),
  password: z.string().min(1, 'Nhập mật khẩu').max(128),
});
type Form = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { schoolCode: '', identifier: '', password: '' } });
  const code = watch('schoolCode');

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('hms.school'); } catch { /* storage unavailable */ }
    setValue('schoolCode', params.get('school') ?? saved ?? '');
  }, [params, setValue]);

  useEffect(() => {
    setSchool(null);
    if (!code || code.length < 2) return;
    const t = setTimeout(() => {
      api<{ name: string }>(`/api/auth/schools/${encodeURIComponent(code.trim())}`).then((s) => setSchool(s.name), () => setSchool(null));
    }, 400);
    return () => clearTimeout(t);
  }, [code]);

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      const r = await api<{ user: { roles: string[]; mustChangePassword: boolean } }>('/api/auth/login', { method: 'POST', body: v });
      try { localStorage.setItem('hms.school', v.schoolCode.trim()); } catch { /* ignore */ }
      qc.clear();
      const next = params.get('next');
      router.replace(r.user.mustChangePassword ? '/change-password' : next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(r.user.roles));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Mã trường" htmlFor="schoolCode" error={errors.schoolCode?.message} hint={school ? <span className="text-success">{school}</span> : 'Do nhà trường cung cấp, ví dụ: demo'}>
        <Input id="schoolCode" autoComplete="organization" autoCapitalize="none" {...register('schoolCode')} />
      </Field>
      <Field label="Mã học sinh / Tên đăng nhập / Email" htmlFor="identifier" error={errors.identifier?.message}>
        <Input id="identifier" autoComplete="username" autoCapitalize="none" {...register('identifier')} />
      </Field>
      <Field label="Mật khẩu" htmlFor="password" error={errors.password?.message}>
        <div className="relative">
          <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-10" {...register('password')} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-soft hover:bg-slate-100" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {error && <div className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">{error}</div>}
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting} icon={<LogIn className="h-4 w-4" />}>Đăng nhập</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Đăng nhập" subtitle="Dành cho quản trị trường, giáo viên và học sinh." footer={<Link href="/platform/login" className="hover:text-primary">Đăng nhập Quản trị nền tảng</Link>}>
      <Suspense><LoginForm /></Suspense>
    </AuthCard>
  );
}
