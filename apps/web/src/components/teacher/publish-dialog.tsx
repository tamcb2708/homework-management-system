'use client';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button, Checkbox, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fromLocalInput, toLocalInput } from '@/lib/format';

/** Giao bài (UC-36): lớp / từng học sinh, thời gian mở, hạn nộp, nộp muộn. */
export function PublishDialog({ open, onOpenChange, assignment, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; assignment: any; onDone: (a: any) => void }) {
  const teaching = useQuery({ queryKey: ['teaching'], queryFn: () => api<any>('/api/teacher/teaching'), enabled: open });
  const classes = (teaching.data?.classes ?? []).filter((c: any) => c.subjectId === assignment.subject.id);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openAt, setOpenAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [allowLate, setAllowLate] = useState(false);
  const [lateUntil, setLateUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const live = assignment.status === 'PUBLISHED';
  useEffect(() => {
    if (!open) return;
    setClassIds(assignment.targets.filter((t: any) => t.type === 'CLASS').map((t: any) => t.classId));
    setStudentIds(assignment.targets.filter((t: any) => t.type === 'STUDENT').map((t: any) => t.studentId));
    setOpenAt(toLocalInput(assignment.openAt ?? new Date()));
    setDueAt(toLocalInput(assignment.dueAt ?? new Date(Date.now() + 7 * 86400_000)));
    setAllowLate(assignment.allowLate); setLateUntil(toLocalInput(assignment.lateUntil));
  }, [open, assignment]);
  const submit = async () => {
    setBusy(true);
    try {
      const body = { classIds, studentIds: studentIds.filter((s) => !classes.some((c: any) => classIds.includes(c.classId) && c.students.some((x: any) => x.id === s))), openAt: live ? undefined : fromLocalInput(openAt), dueAt: fromLocalInput(dueAt), allowLate, lateUntil: allowLate ? fromLocalInput(lateUntil) : undefined };
      const a = await api(`/api/teacher/assignments/${assignment.id}/publish`, { method: 'POST', body });
      toast.success(a.status === 'SCHEDULED' ? 'Đã lên lịch giao bài' : 'Đã giao bài cho học sinh');
      onDone(a); onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={live ? 'Cập nhật giao bài' : 'Giao bài'} size="lg"
      description={live ? 'Có thể thêm lớp/học sinh và gia hạn. Không thể thay đổi thời gian mở bài đã qua.' : 'Học sinh nhận thông báo khi bài được mở.'}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button loading={busy} onClick={submit} disabled={!classIds.length && !studentIds.length} data-testid="confirm-publish">{live ? 'Lưu thay đổi' : 'Giao bài'}</Button></>}>
      <div className="space-y-5">
        <Field label="Lớp nhận bài" hint={classes.length ? 'Chỉ hiển thị lớp bạn dạy môn này.' : undefined}>
          {teaching.isLoading ? <p className="text-sm text-ink-soft">Đang tải…</p> : !classes.length ? <p className="text-sm text-danger">Bạn chưa được phân công lớp nào cho môn {assignment.subject.name}.</p> : (
            <div className="divide-y divide-line rounded-xl border border-line">
              {classes.map((c: any) => (
                <div key={c.classId}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <Checkbox label={<span><b>{c.code}</b> – {c.name} <span className="text-ink-soft">({c.students.length} HS)</span></span>} checked={classIds.includes(c.classId)}
                      onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.classId] : classIds.filter((x) => x !== c.classId))} data-testid={`class-${c.code}`} />
                    {!classIds.includes(c.classId) && <button className="inline-flex items-center gap-1 text-xs text-primary" onClick={() => setExpanded(expanded === c.classId ? null : c.classId)}>
                      {expanded === c.classId ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Chọn từng học sinh
                    </button>}
                  </div>
                  {expanded === c.classId && !classIds.includes(c.classId) && (
                    <div className="grid gap-1 bg-slate-50/60 px-4 py-2 sm:grid-cols-2">
                      {c.students.map((s: any) => (
                        <Checkbox key={s.id} label={<span className="text-[13px]">{s.studentCode} · {s.fullName}</span>} checked={studentIds.includes(s.id)}
                          onChange={(e) => setStudentIds(e.target.checked ? [...studentIds, s.id] : studentIds.filter((x) => x !== s.id))} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Thời gian mở bài" hint={live ? 'Bài đã mở.' : 'Để thời điểm tương lai để lên lịch tự động.'}><Input type="datetime-local" value={openAt} disabled={live} onChange={(e) => setOpenAt(e.target.value)} /></Field>
          <Field label="Hạn nộp" required><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} data-testid="due-at" /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="pt-2"><Checkbox label="Cho phép nộp muộn" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} /></div>
          {allowLate && <Field label="Hạn nộp muộn"><Input type="datetime-local" value={lateUntil} onChange={(e) => setLateUntil(e.target.value)} /></Field>}
        </div>
      </div>
    </Dialog>
  );
}
