'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, Table, Td } from '@/components/ui/blocks';
import { Dialog } from '@/components/ui/dialog';
import { Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

const schema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,20}$/, 'Mã lớp 1–20 ký tự: chữ, số, . _ -'),
  name: z.string().trim().min(1, 'Nhập tên lớp').max(100),
  schoolYearId: z.string().uuid('Chọn năm học'),
  gradeLevel: z.coerce.number().int().min(1).max(12).optional(),
  homeroomTeacherId: z.string().optional(),
});

export default function ClassesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['admin-classes'], queryFn: () => api<any[]>('/api/admin/classes') });
  const years = useQuery({ queryKey: ['school-years'], queryFn: () => api<any[]>('/api/admin/school-years') });
  const teachers = useQuery({ queryKey: ['users', 'teachers-all'], queryFn: () => api<any>('/api/admin/users?role=TEACHER&pageSize=100') });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) as any });
  const rows = (list.data ?? []).filter((c) => !q || `${c.code} ${c.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Lớp học" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { form.reset({ schoolYearId: years.data?.find((y) => y.isCurrent)?.id ?? '' }); setOpen(true); }}>Thêm lớp</Button>} />
      <Card>
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={setQ} placeholder="Tìm lớp…" className="max-w-sm" /></div>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !rows.length ? <EmptyState title="Chưa có lớp học" description="Tạo lớp, sau đó thêm học sinh và phân công giáo viên." /> : (
          <Table head={['Mã lớp', 'Tên lớp', 'Khối', 'Năm học', 'GV chủ nhiệm', 'Học sinh', 'Phân công', '']}>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <Td className="font-medium"><Link href={`/admin/classes/${c.id}`} className="hover:text-primary">{c.code}</Link></Td>
                <Td>{c.name}</Td><Td>{c.gradeLevel ?? '—'}</Td><Td>{c.schoolYear.name}</Td><Td>{c.homeroomTeacher?.fullName ?? '—'}</Td>
                <Td>{c.studentCount}</Td><Td>{c.teacherCount}</Td>
                <Td className="text-right"><Link href={`/admin/classes/${c.id}`} className="text-[13px] font-medium text-primary hover:underline">Quản lý</Link></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title="Thêm lớp học"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit" form="class-form" loading={form.formState.isSubmitting}>Tạo lớp</Button></>}>
        <form id="class-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(async (v) => {
          try {
            const body = { ...v, homeroomTeacherId: v.homeroomTeacherId || undefined, gradeLevel: v.gradeLevel || undefined };
            await api('/api/admin/classes', { method: 'POST', body }); toast.success('Đã tạo lớp'); setOpen(false); qc.invalidateQueries({ queryKey: ['admin-classes'] });
          } catch (e) { toast.error(errorMessage(e)); }
        })}>
          <Field label="Mã lớp" required error={form.formState.errors.code?.message}><Input placeholder="VD: 8A3" {...form.register('code')} /></Field>
          <Field label="Tên lớp" required error={form.formState.errors.name?.message}><Input placeholder="VD: Lớp 8A3" {...form.register('name')} /></Field>
          <Field label="Năm học" required error={form.formState.errors.schoolYearId?.message}>
            <Select {...form.register('schoolYearId')}><option value="">— Chọn —</option>{years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (hiện hành)' : ''}</option>)}</Select>
          </Field>
          <Field label="Khối" error={form.formState.errors.gradeLevel?.message}><Input type="number" min={1} max={12} {...form.register('gradeLevel')} /></Field>
          <Field label="Giáo viên chủ nhiệm" className="sm:col-span-2">
            <Select {...form.register('homeroomTeacherId')}><option value="">— Không —</option>{teachers.data?.items.map((t: any) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</Select>
          </Field>
        </form>
      </Dialog>
    </>
  );
}
