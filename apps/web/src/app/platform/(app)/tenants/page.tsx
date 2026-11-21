'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td } from '@/components/ui/blocks';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, Field, Input } from '@/components/ui/primitives';
import { TempPasswordDialog } from '@/components/admin/temp-password';
import { api, errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';

const schema = z.object({
  name: z.string().trim().min(3, 'Tối thiểu 3 ký tự'),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Chỉ gồm chữ thường, số, gạch ngang'),
  maxUsers: z.preprocess((v) => (v === '' || v === undefined ? undefined : Number(v)), z.number({ invalid_type_error: 'Phải là số' }).int().min(1, 'Tối thiểu 1').max(100000).optional()),
  adminFullName: z.string().trim().min(2, 'Nhập họ tên'),
  adminEmail: z.string().trim().email('Email không hợp lệ'),
});

export default function TenantsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['platform-stats'], queryFn: () => api<any>('/api/platform/stats') });
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<{ username: string; password: string; note?: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) as any });
  const status = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'activate' }) => api(`/api/platform/tenants/${id}/${action}`, { method: 'POST', body: {} }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-stats'] }); toast.success('Đã cập nhật trạng thái trường.'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Trường học" description="Mỗi trường là một tenant độc lập; dữ liệu được cô lập hoàn toàn." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { reset(); setOpen(true); }}>Thêm trường</Button>} />
      <Card>
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data.perTenant.length ? <EmptyState title="Chưa có trường nào" /> : (
          <Table head={['Tên trường', 'Mã trường', 'Trạng thái', 'Người dùng', 'Ngày tạo', '']}>
            {q.data.perTenant.map((t: any) => (
              <tr key={t.id}>
                <Td className="font-medium">{t.name}</Td>
                <Td><code className="text-xs">{t.slug}</code></Td>
                <Td><Badge tone={t.status === 'ACTIVE' ? 'success' : 'danger'}>{t.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm ngưng'}</Badge></Td>
                <Td>{t.users}{t.maxUsers ? ` / ${t.maxUsers}` : ''}</Td>
                <Td>{fmtDate(t.createdAt)}</Td>
                <Td className="text-right">
                  {t.status === 'ACTIVE'
                    ? <Button size="sm" variant="outline" onClick={async () => (await confirm({ title: `Tạm ngưng ${t.name}?`, description: 'Toàn bộ người dùng của trường sẽ bị đăng xuất và không thể đăng nhập. Dữ liệu được giữ nguyên.', tone: 'danger', confirmText: 'Tạm ngưng' })) && status.mutate({ id: t.id, action: 'suspend' })}>Tạm ngưng</Button>
                    : <Button size="sm" variant="secondary" onClick={() => status.mutate({ id: t.id, action: 'activate' })}>Kích hoạt lại</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title="Thêm trường mới" description="Hệ thống tạo tài khoản quản trị trường với mật khẩu tạm (hiển thị một lần)."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button form="tenant-form" type="submit" loading={isSubmitting}>Tạo trường</Button></>}>
        <form id="tenant-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(async (v) => {
          try {
            const r = await api<any>('/api/platform/tenants', { method: 'POST', body: v });
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['platform-stats'] });
            setTemp({ username: r.schoolAdmin.username, password: r.schoolAdmin.temporaryPassword, note: `Mã trường: ${r.slug}` });
          } catch (e) { toast.error(errorMessage(e)); }
        })}>
          <Field label="Tên trường" required error={errors.name?.message} className="sm:col-span-2"><Input {...register('name')} /></Field>
          <Field label="Mã trường" required error={errors.slug?.message} hint="Dùng khi đăng nhập"><Input {...register('slug')} /></Field>
          <Field label="Giới hạn tài khoản" error={errors.maxUsers?.message as string}><Input type="number" {...register('maxUsers')} /></Field>
          <Field label="Họ tên quản trị trường" required error={errors.adminFullName?.message}><Input {...register('adminFullName')} /></Field>
          <Field label="Email quản trị trường" required error={errors.adminEmail?.message}><Input type="email" {...register('adminEmail')} /></Field>
        </form>
      </Dialog>
      <TempPasswordDialog value={temp} onClose={() => setTemp(null)} />
    </>
  );
}
