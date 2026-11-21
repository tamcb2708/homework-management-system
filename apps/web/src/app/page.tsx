'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/auth';
import { homeFor } from '@/lib/format';
import { Spinner } from '@/components/ui/primitives';

export default function Home() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.data) router.replace(me.data.mustChangePassword ? '/change-password' : homeFor(me.data.roles));
    else if (me.error) router.replace('/login');
  }, [me.data, me.error, router]);
  return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}
