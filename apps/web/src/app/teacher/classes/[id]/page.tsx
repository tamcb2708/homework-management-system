'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, SearchInput, StatCard, Table, Td } from '@/components/ui/blocks';
import { Badge, Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';

export default function TeacherClass() {
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState('');
  const c = useQuery({ queryKey: ['teacher-class', id], queryFn: () => api<any>(`/api/teacher/classes/${id}`) });
  if (c.isLoading) return <LoadingBlock rows={6} />;
  if (c.error) return <ErrorState error={c.error} />;
  const d = c.data;
  const rows = d.students.filter((s: any) => !q || `${s.studentCode} ${s.fullName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader back={{ href: '/teacher/classes', label: 'Lớp học' }} title={`${d.code} · ${d.name}`} description={d.subjects.map((s: any) => s.name).join(', ')} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Học sinh" value={d.studentCount} />
        <StatCard label="Bài tập đã giao" value={d.assignmentCount} tone="neutral" />
        <StatCard label="Tỷ lệ hoàn thành" value={d.completionRate === null ? '—' : `${d.completionRate}%`} tone="success" />
        <StatCard label="Điểm TB lớp" value={d.averagePercent === null ? '—' : `${d.averagePercent}%`} tone="info" hint="Theo % tổng điểm, bài đã công bố" />
      </div>
      <Card className="mt-6">
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={setQ} placeholder="Tìm học sinh…" className="max-w-sm" /></div>
        {!rows.length ? <EmptyState title="Không có học sinh" /> : (
          <Table head={['Mã HS', 'Họ tên', 'Hoàn thành', 'Điểm TB', '']}>
            {rows.map((s: any) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.studentCode}</Td>
                <Td>{s.fullName} {d.lowPerformers.includes(s.id) && <Badge tone="danger">Cần hỗ trợ</Badge>}</Td>
                <Td><div className="flex w-40 items-center gap-2"><ProgressBar value={s.completionRate} /><span className="text-xs tabular-nums text-ink-soft">{s.submitted}/{s.assigned}</span></div></Td>
                <Td className="tabular-nums">{s.averagePercent === null ? '—' : `${s.averagePercent}%`}</Td>
                <Td className="text-right"><Link href={`/teacher/classes/${id}/students/${s.id}`} className="text-[13px] font-medium text-primary hover:underline">Lịch sử học tập</Link></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
