'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, ApiError } from './api';
import { homeFor } from './format';

export interface Me {
  id: string; fullName: string; username: string; email: string | null; roles: string[]; mustChangePassword: boolean;
  tenant: { id: string; slug: string; name: string };
}

export function useMe() {
  return useQuery<Me, ApiError>({ queryKey: ['me'], queryFn: () => api<Me>('/api/auth/me'), retry: false, staleTime: 60_000 });
}

/** Client-side routing guard. Real authorization is enforced by the API on every request. */
export function useRequireRole(role: 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'ANY') {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.error?.status === 401 || me.error?.status === 403) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    else if (me.data?.mustChangePassword) router.replace('/change-password');
    else if (me.data && role !== 'ANY' && !me.data.roles.includes(role)) router.replace(homeFor(me.data.roles));
  }, [me.data, me.error, role, router]);
  const ok = !!me.data && !me.data.mustChangePassword && (role === 'ANY' || me.data.roles.includes(role));
  return { me: me.data, ready: ok, error: me.error && me.error.status !== 401 ? me.error : null };
}

export function usePlatformMe() {
  return useQuery<{ id: string; email: string; fullName: string }, ApiError>({ queryKey: ['platform-me'], queryFn: () => api('/api/platform/auth/me'), retry: false });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async (realm: 'tenant' | 'platform' = 'tenant') => {
    await api(realm === 'platform' ? '/api/platform/auth/logout' : '/api/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    qc.clear();
    router.replace(realm === 'platform' ? '/platform/login' : '/login');
  };
}
