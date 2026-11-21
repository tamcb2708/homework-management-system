'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, Table, Td } from '@/components/ui/blocks';
import { Badge, Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { ASSIGNMENT_STATUS, fmtDateTime, PHASE } from '@/lib/format';

export default function AdminAssignments() {
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['admin-assignments', q], queryFn: () => api<any[]>(`/api/admin/assignments${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <>
      <PageHeader title="Bài tập toàn trường" description="Theo dõi tiến độ. Xem nội dung bài làm cần nhập lý do và được ghi nhật ký (truy cập nhạy cảm)." />
      <Card>
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={setQ} placeholder="Tìm theo tiêu đề…" className="max-w-sm" /></div>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState error={list.error} /> : !list.data?.length ? <EmptyState title="Chưa có bài tập được giao" /> : (
          <Table head={['Bài tập', 'Môn', 'Giáo viên', 'Trạng thái', 'Hạn nộp', 'Đã nộp', 'Đã công bố']}>
            {list.data.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60">
                <Td className="font-medium"><Link href={`/admin/assignments/${a.id}`} className="hover:text-primary">{a.title}</Link></Td>
                <Td>{a.subject}</Td><Td>{a.teacher}</Td>
                <Td><Badge tone={ASSIGNMENT_STATUS[a.status].tone}>{ASSIGNMENT_STATUS[a.status].label}</Badge> {a.phase && <Badge tone={PHASE[a.phase].tone}>{PHASE[a.phase].label}</Badge>}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtDateTime(a.dueAt)}</Td><Td>{a.submitted}</Td><Td>{a.published}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
