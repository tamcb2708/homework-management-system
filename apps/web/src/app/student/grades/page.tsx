'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, StatCard, Table, Td } from '@/components/ui/blocks';
import { Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime, fmtScore } from '@/lib/format';

export default function StudentGrades() {
  const list = useQuery({ queryKey: ['student-assignments', 'graded', ''], queryFn: () => api<any[]>('/api/student/assignments?filter=graded') });
  const rows = list.data ?? [];
  const pcts = rows.filter((r) => r.earnedScore !== null && r.maxScore).map((r) => r.earnedScore / r.maxScore);
  const avg = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 1000) / 10 : null;
  return (
    <>
      <PageHeader title="Kết quả học tập" description="Điểm các bài tập đã được giáo viên công bố." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Số bài có điểm" value={rows.length} />
        <StatCard label="Điểm trung bình" value={avg === null ? '—' : `${avg}%`} tone="success" hint="Theo % tổng điểm từng bài" />
      </div>
      <Card>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState error={list.error} /> : !rows.length ? <EmptyState title="Chưa có điểm được công bố" /> : (
          <Table head={['Bài tập', 'Môn', 'Hạn nộp', 'Điểm', 'Tỷ lệ', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.title}</Td><Td>{r.subject.name}</Td><Td className="text-ink-soft">{fmtDateTime(r.dueAt)}</Td>
                <Td className="font-semibold tabular-nums">{fmtScore(r.earnedScore)}/{fmtScore(r.maxScore)}</Td>
                <Td><div className="w-32"><ProgressBar value={(r.earnedScore / r.maxScore) * 100} tone={r.earnedScore / r.maxScore >= 0.5 ? 'success' : 'warning'} /></div></Td>
                <Td className="text-right"><Link href={`/student/assignments/${r.id}`} className="text-[13px] font-medium text-primary hover:underline">Xem chi tiết</Link></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
