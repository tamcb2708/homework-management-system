'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus, UserPlus, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, Table, Td } from '@/components/ui/blocks';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Select } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin-class', id], queryFn: () => api<any>(`/api/admin/classes/${id}`) });
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-class', id] }); qc.invalidateQueries({ queryKey: ['admin-classes'] }); };
  const remove = useMutation({ mutationFn: (sid: string) => api(`/api/admin/classes/${id}/students/${sid}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Đã gỡ học sinh khỏi lớp'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const unassign = useMutation({ mutationFn: (tid: string) => api(`/api/admin/classes/${id}/teachers/${tid}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Đã gỡ phân công'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  if (q.isLoading) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  return (
    <>
      <PageHeader back={{ href: '/admin/classes', label: 'Lớp học' }} title={`${c.code} · ${c.name}`} description={`Năm học ${c.schoolYear.name}${c.homeroomTeacher ? ` · GVCN: ${c.homeroomTeacher.fullName}` : ''}`} />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={`Học sinh (${c.students.length})`} action={<Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>Thêm học sinh</Button>} />
          {!c.students.length ? <EmptyState title="Lớp chưa có học sinh" /> : (
            <Table head={['Mã HS', 'Họ tên', 'Email', 'Vào lớp', '']}>
              {c.students.map((s: any) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.studentCode}</Td><Td>{s.fullName} {s.status !== 'ACTIVE' && <Badge tone="danger">Đã khóa</Badge>}</Td><Td className="text-ink-soft">{s.email ?? '—'}</Td><Td className="text-ink-soft">{fmtDate(s.joinedAt)}</Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" icon={<UserMinus className="h-4 w-4" />} onClick={async () => (await confirm({ title: `Gỡ ${s.fullName} khỏi lớp?`, description: 'Học sinh không nhận bài mới của lớp; bài đã nộp và điểm vẫn được giữ.', tone: 'danger', confirmText: 'Gỡ khỏi lớp' })) && remove.mutate(s.id)}>Gỡ</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Phân công giảng dạy" action={<Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>Phân công</Button>} />
          {!c.teachers.length ? <EmptyState title="Chưa phân công giáo viên" /> : (
            <ul className="divide-y divide-line">
              {c.teachers.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0"><div className="font-medium">{t.fullName}</div><div className="text-[13px] text-ink-soft">{t.subject.name}{t.semester ? ` · ${t.semester.name}` : ' · Cả năm'}</div></div>
                  <Button size="icon" variant="ghost" aria-label="Gỡ phân công" onClick={async () => (await confirm({ title: 'Gỡ phân công?', description: `${t.fullName} sẽ mất quyền truy cập bài tập và bài nộp của lớp ${c.code} (môn ${t.subject.name}) ngay lập tức.`, tone: 'danger', confirmText: 'Gỡ phân công' })) && unassign.mutate(t.id)}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <AddStudentsDialog open={adding} onOpenChange={setAdding} classId={id} existing={c.students.map((s: any) => s.id)} onDone={refresh} />
      <AssignTeacherDialog open={assigning} onOpenChange={setAssigning} classId={id} onDone={refresh} />
    </>
  );
}

function AddStudentsDialog({ open, onOpenChange, classId, existing, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; classId: string; existing: string[]; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['users', 'students-pick', q], enabled: open, queryFn: () => api<any>(`/api/admin/users?role=STUDENT&pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  const rows = useMemo(() => (list.data?.items ?? []).filter((s: any) => !existing.includes(s.id)), [list.data, existing]);
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPicked([]); }} title="Thêm học sinh vào lớp" size="lg"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={!picked.length} loading={busy} onClick={async () => {
        setBusy(true);
        try { const r = await api<any>(`/api/admin/classes/${classId}/students`, { method: 'POST', body: { studentIds: picked } }); toast.success(`Đã thêm ${r.added} học sinh`); setPicked([]); onOpenChange(false); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Thêm {picked.length || ''} học sinh</Button></>}>
      <SearchInput value={q} onChange={setQ} placeholder="Tìm theo tên hoặc mã HS…" />
      <div className="mt-3 max-h-[360px] divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {list.isLoading ? <LoadingBlock rows={3} /> : !rows.length ? <EmptyState title="Không còn học sinh phù hợp" /> : rows.map((s: any) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
            <Checkbox checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} aria-label={s.fullName} />
            <span className="w-20 text-[13px] font-medium">{s.studentCode}</span><span className="flex-1 text-sm">{s.fullName}</span>
            <span className="text-xs text-ink-soft">{s.classes.map((c: any) => c.code).join(', ') || 'Chưa xếp lớp'}</span>
          </label>
        ))}
      </div>
    </Dialog>
  );
}

function AssignTeacherDialog({ open, onOpenChange, classId, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; classId: string; onDone: () => void }) {
  const [teacherId, setTeacherId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const teachers = useQuery({ queryKey: ['users', 'teachers-all'], enabled: open, queryFn: () => api<any>('/api/admin/users?role=TEACHER&pageSize=100') });
  const subjects = useQuery({ queryKey: ['subjects'], enabled: open, queryFn: () => api<any[]>('/api/admin/subjects') });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Phân công giáo viên" size="sm"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button disabled={!teacherId || !subjectId} loading={busy} onClick={async () => {
        setBusy(true);
        try { await api(`/api/admin/classes/${classId}/teachers`, { method: 'POST', body: { teacherId, subjectId } }); toast.success('Đã phân công'); onOpenChange(false); setTeacherId(''); setSubjectId(''); onDone(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Phân công</Button></>}>
      <div className="space-y-4">
        <Field label="Giáo viên" required><Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}><option value="">— Chọn —</option>{teachers.data?.items.filter((t: any) => t.status === 'ACTIVE').map((t: any) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</Select></Field>
        <Field label="Môn học" required><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">— Chọn —</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}
