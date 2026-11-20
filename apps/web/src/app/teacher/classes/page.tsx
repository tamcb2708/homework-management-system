'use client';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/blocks';
import { Badge, Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';

export default function TeacherClasses() {
  const q = useQuery({ queryKey: ['teacher-classes'], queryFn: () => api<any[]>('/api/teacher/classes') });
  return (
    <>
      <PageHeader title="Lớp học" description="Các lớp bạn được phân công giảng dạy." />
      {q.isLoading ? <Card><LoadingBlock /></Card> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState title="Bạn chưa được phân công lớp nào" description="Liên hệ quản trị trường để được phân công." /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((c) => (
            <Link key={`${c.classId}-${c.subject.id}`} href={`/teacher/classes/${c.classId}`}>
              <Card className="flex items-center gap-4 p-5 transition hover:border-primary/30 hover:shadow-pop">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-base font-semibold text-primary">{c.code}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft"><Badge tone="primary">{c.subject.name}</Badge><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.students} học sinh</span></div>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-faint" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
