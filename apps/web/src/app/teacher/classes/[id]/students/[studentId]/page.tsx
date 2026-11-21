'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td } from '@/components/ui/blocks';
import { Badge, Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime, fmtScore, STUDENT_STATUS } from '@/lib/format';

export default function StudentHistory() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  const q = useQuery({ queryKey: ['student-history', id, studentId], queryFn: () => api<any>(`/api/teacher/classes/${id}/students/${studentId}/history`) });
  if (q.isLoading) return <LoadingBlock rows={5} />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader back={{ href: `/teacher/classes/${id}`, label: 'Về lớp' }} title={`${q.data.student.studentCode} · ${q.data.student.fullName}`} description="Lịch sử bài tập trong các môn bạn dạy." />
      <Card>
        {!q.data.items.length ? <EmptyState title="Chưa có bài tập" /> : (
          <Table head={['Bài tập', 'Môn', 'Hạn nộp', 'Trạng thái', 'Nộp lúc', 'Điểm', '']}>
            {q.data.items.map((i: any) => (
              <tr key={i.assignmentId}>
                <Td className="font-medium">{i.title}</Td><Td>{i.subject}</Td><Td className="text-ink-soft">{fmtDateTime(i.dueAt)}</Td>
                <Td><Badge tone={STUDENT_STATUS[i.status].tone}>{STUDENT_STATUS[i.status].label}</Badge> {i.isLate && <Badge tone="warning">Muộn</Badge>}</Td>
                <Td className="text-ink-soft">{fmtDateTime(i.submittedAt)}</Td>
                <Td className="tabular-nums">{i.earnedScore === null ? '—' : `${fmtScore(i.earnedScore)}/${fmtScore(i.maxScore)}`}</Td>
                <Td className="text-right">{i.submissionId && <Link href={`/teacher/grading/${i.submissionId}`} className="text-[13px] font-medium text-primary hover:underline">Xem bài</Link>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
