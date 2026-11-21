'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td } from '@/components/ui/blocks';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Button, Card, Checkbox, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

export default function SubjectsPage() {
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['subjects', archived], queryFn: () => api<any[]>(`/api/admin/subjects?includeArchived=${archived}`) });
  const form = useForm<{ code: string; name: string }>();
  const toggle = useMutation({
    mutationFn: (s: any) => api(`/api/admin/subjects/${s.id}`, { method: 'PATCH', body: { archived: !s.archivedAt } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }), onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Môn học" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { form.reset(); setOpen(true); }}>Thêm môn</Button>} />
      <Card>
        <div className="border-b border-line p-4"><Checkbox label="Hiện môn đã lưu trữ" checked={archived} onChange={(e) => setArchived(e.target.checked)} /></div>
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState title="Chưa có môn học" /> : (
          <Table head={['Mã môn', 'Tên môn', 'Trạng thái', '']}>
            {q.data.map((s) => (
              <tr key={s.id}><Td className="font-medium">{s.code}</Td><Td>{s.name}</Td><Td>{s.archivedAt ? <Badge>Đã lưu trữ</Badge> : <Badge tone="success">Đang dùng</Badge>}</Td>
                <Td className="text-right"><Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === s.id} onClick={() => toggle.mutate(s)}>{s.archivedAt ? 'Khôi phục' : 'Lưu trữ'}</Button></Td></tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title="Thêm môn học" size="sm"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit" form="subject-form" loading={form.formState.isSubmitting}>Tạo môn</Button></>}>
        <form id="subject-form" className="space-y-4" onSubmit={form.handleSubmit(async (v) => {
          try { await api('/api/admin/subjects', { method: 'POST', body: v }); toast.success('Đã tạo môn học'); setOpen(false); qc.invalidateQueries({ queryKey: ['subjects'] }); }
          catch (e) { toast.error(errorMessage(e)); }
        })}>
          <Field label="Mã môn" required error={form.formState.errors.code && 'Mã môn 1–20 ký tự chữ/số'}><Input placeholder="VD: LY" {...form.register('code', { required: true, pattern: /^[A-Za-z0-9_-]{1,20}$/ })} /></Field>
          <Field label="Tên môn" required error={form.formState.errors.name && 'Nhập tên môn'}><Input placeholder="VD: Vật lý" {...form.register('name', { required: true })} /></Field>
        </form>
      </Dialog>
    </>
  );
}
