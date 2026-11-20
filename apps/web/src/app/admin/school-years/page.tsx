'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/blocks';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function SchoolYearsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['school-years'], queryFn: () => api<any[]>('/api/admin/school-years') });
  const [yearOpen, setYearOpen] = useState(false);
  const [semFor, setSemFor] = useState<any>(null);
  const yf = useForm<{ name: string; startDate: string; endDate: string; isCurrent: boolean }>();
  const sf = useForm<{ name: string; ordinal: number; startDate: string; endDate: string }>();
  const refresh = () => qc.invalidateQueries({ queryKey: ['school-years'] });
  return (
    <>
      <PageHeader title="Năm học & học kỳ" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { yf.reset({ isCurrent: false }); setYearOpen(true); }}>Thêm năm học</Button>} />
      {q.isLoading ? <Card><LoadingBlock /></Card> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState title="Chưa có năm học" /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.map((y) => (
            <Card key={y.id}>
              <CardHeader title={<span className="flex items-center gap-2">{y.name} {y.isCurrent && <Badge tone="primary">Hiện hành</Badge>}</span>} description={`${fmtDate(y.startDate)} – ${fmtDate(y.endDate)} · ${y._count.classes} lớp`}
                action={<div className="flex gap-2">
                  {!y.isCurrent && <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/api/admin/school-years/${y.id}`, { method: 'PUT', body: { name: y.name, startDate: y.startDate.slice(0, 10), endDate: y.endDate.slice(0, 10), isCurrent: true } }); toast.success('Đã đặt năm học hiện hành'); refresh(); } catch (e) { toast.error(errorMessage(e)); } }}>Đặt hiện hành</Button>}
                  <Button size="sm" variant="secondary" onClick={() => { sf.reset({ ordinal: y.semesters.length + 1 }); setSemFor(y); }}>Thêm học kỳ</Button>
                </div>} />
              {!y.semesters.length ? <p className="px-5 py-4 text-sm text-ink-soft">Chưa có học kỳ.</p> : (
                <ul className="divide-y divide-line">
                  {y.semesters.map((s: any) => (
                    <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span><span className="font-medium">{s.name}</span> <span className="text-ink-soft">· {fmtDate(s.startDate)} – {fmtDate(s.endDate)}</span></span>
                      <Button size="icon" variant="ghost" aria-label={`Xóa ${s.name}`} onClick={async () => {
                        if (!(await confirm({ title: `Xóa ${s.name}?`, tone: 'danger', confirmText: 'Xóa' }))) return;
                        try { await api(`/api/admin/semesters/${s.id}`, { method: 'DELETE' }); refresh(); } catch (e) { toast.error(errorMessage(e)); }
                      }}><Trash2 className="h-4 w-4" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={yearOpen} onOpenChange={setYearOpen} title="Thêm năm học" size="sm" footer={<><Button variant="outline" onClick={() => setYearOpen(false)}>Hủy</Button><Button type="submit" form="year-form" loading={yf.formState.isSubmitting}>Tạo</Button></>}>
        <form id="year-form" className="space-y-4" onSubmit={yf.handleSubmit(async (v) => { try { await api('/api/admin/school-years', { method: 'POST', body: v }); setYearOpen(false); refresh(); toast.success('Đã tạo năm học'); } catch (e) { toast.error(errorMessage(e)); } })}>
          <Field label="Tên năm học" required><Input placeholder="2027–2028" {...yf.register('name', { required: true })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Bắt đầu" required><Input type="date" {...yf.register('startDate', { required: true })} /></Field><Field label="Kết thúc" required><Input type="date" {...yf.register('endDate', { required: true })} /></Field></div>
          <Checkbox label="Đặt làm năm học hiện hành" {...yf.register('isCurrent')} />
        </form>
      </Dialog>
      <Dialog open={!!semFor} onOpenChange={(v) => !v && setSemFor(null)} title={`Thêm học kỳ – ${semFor?.name ?? ''}`} size="sm" footer={<><Button variant="outline" onClick={() => setSemFor(null)}>Hủy</Button><Button type="submit" form="sem-form" loading={sf.formState.isSubmitting}>Tạo</Button></>}>
        <form id="sem-form" className="space-y-4" onSubmit={sf.handleSubmit(async (v) => { try { await api(`/api/admin/school-years/${semFor.id}/semesters`, { method: 'POST', body: { ...v, ordinal: Number(v.ordinal) } }); setSemFor(null); refresh(); toast.success('Đã thêm học kỳ'); } catch (e) { toast.error(errorMessage(e)); } })}>
          <div className="grid grid-cols-3 gap-3"><Field label="Tên" required className="col-span-2"><Input placeholder="Học kỳ I" {...sf.register('name', { required: true })} /></Field><Field label="Thứ tự"><Input type="number" min={1} max={6} {...sf.register('ordinal', { required: true })} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Bắt đầu" required><Input type="date" {...sf.register('startDate', { required: true })} /></Field><Field label="Kết thúc" required><Input type="date" {...sf.register('endDate', { required: true })} /></Field></div>
        </form>
      </Dialog>
    </>
  );
}
