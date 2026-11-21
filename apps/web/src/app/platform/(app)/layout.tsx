'use client';
import { Building2, FileClock, LayoutDashboard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { useLogout, usePlatformMe } from '@/lib/auth';

const nav = [
  { href: '/platform', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
  { href: '/platform/tenants', label: 'Trường học', icon: Building2 },
  { href: '/platform/audit', label: 'Nhật ký nền tảng', icon: FileClock },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const me = usePlatformMe();
  const router = useRouter();
  const logout = useLogout();
  useEffect(() => { if (me.error?.status === 401) router.replace('/platform/login'); }, [me.error, router]);
  return (
    <AppShell nav={nav} roleLabel="Quản trị nền tảng" userName={me.data?.fullName} orgName="Platform" onLogout={() => logout('platform')} ready={!!me.data} showBell={false}
      error={me.error && me.error.status !== 401 ? me.error : undefined}>
      {children}
    </AppShell>
  );
}
