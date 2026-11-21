'use client';
import { useQuery } from '@tanstack/react-query';
import { Eye, ShieldAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AnswerView } from '@/components/content/answer-view';
import { MathText } from '@/components/content/math-text';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td } from '@/components/ui/blocks';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Button, Card, Field, Select, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtScore, SUBMISSION_STATUS } from '@/lib/format';

const REASONS = ['Phụ huynh khiếu nại điểm', 'Kiểm tra chất lượng chấm bài', 'Yêu cầu của Ban giám hiệu', 'Hỗ trợ giáo viên'];

export default function AdminAssignmentSubmissions() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['admin-asg-subs', id], queryFn: () => api<any>(`/api/admin/assignments/${id}/submissions`) });
  const [target, setTarget] = useState<any>(null);
  const [reasonType, setReasonType] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [content, setContent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader back={{ href: '/admin/assignments', label: 'Bài tập toàn trường' }} title={q.data?.assignment.title ?? 'Bài tập'} description={q.data ? `${q.data.assignment.subject} · ${q.data.rows.length} bài nộp` : undefined} />
      <Card>
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState error={q.error} /> : !q.data.rows.length ? <EmptyState title="Chưa có bài nộp" /> : (
          <Table head={['Mã HS', 'Họ tên', 'Trạng thái', 'Nộp lúc', '']}>
            {q.data.rows.map((r: any) => (
              <tr key={r.submissionId}>
                <Td className="font-medium">{r.studentCode}</Td><Td>{r.fullName}</Td>
                <Td><Badge tone={SUBMISSION_STATUS[r.status]?.tone}>{SUBMISSION_STATUS[r.status]?.label}</Badge> {r.isLate && <Badge tone="warning">Muộn</Badge>}</Td>
                <Td className="text-ink-soft">{fmtDateTime(r.submittedAt)}</Td>
                <Td className="text-right"><Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />} onClick={() => { setTarget(r); setNote(''); setContent(null); }}>Xem bài làm</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={!!target && !content} onOpenChange={(v) => !v && setTarget(null)} title="Lý do truy cập bài làm" size="sm"
        description="Thao tác này được ghi vào nhật ký truy cập dữ liệu nhạy cảm (D7.3)."
        footer={<><Button variant="outline" onClick={() => setTarget(null)}>Hủy</Button><Button loading={busy} icon={<ShieldAlert className="h-4 w-4" />} onClick={async () => {
          setBusy(true);
          try { const reason = note.trim() ? `${reasonType}: ${note.trim()}` : reasonType; setContent(await api(`/api/admin/submissions/${target.submissionId}?reason=${encodeURIComponent(reason)}`)); }
          catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}>Xác nhận và xem</Button></>}>
        <div className="space-y-3">
          <Field label="Lý do"><Select value={reasonType} onChange={(e) => setReasonType(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Ghi chú (tùy chọn)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
        </div>
      </Dialog>
      <Dialog open={!!content} onOpenChange={(v) => { if (!v) { setContent(null); setTarget(null); } }} title={content ? `${content.student.studentCode} · ${content.student.fullName}` : ''} size="lg"
        description={content?.grade ? `Điểm: ${fmtScore(content.grade.earnedScore)}/${fmtScore(content.grade.maxScore)} (chỉ xem)` : 'Chưa có điểm'}>
        <div className="space-y-5">
          {content?.questions.map((qq: any) => (
            <div key={qq.ordinal} className="space-y-2">
              <div className="text-sm font-medium">Câu {qq.ordinal}. <MathText text={qq.content} /></div>
              <AnswerView type={qq.type} answer={qq.answer} options={qq.options} files={qq.files} />
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}
