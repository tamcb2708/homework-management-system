'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState, type ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
    },
  }));
  return (
    <QueryClientProvider client={qc}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Toaster position="top-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </QueryClientProvider>
  );
}
