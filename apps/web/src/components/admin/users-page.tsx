'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, MoreHorizontal, Pencil, Plus, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput, Table, Td } from '@/components/ui/blocks';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { TempPasswordDialog } from './temp-password';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

type Role = 'TEACHER' | 'STUDENT';
const base = { fullName: z.string().trim().min(2, 'Nhập họ tên').max(120), phone: z.string().max(30).optional() };
const teacherSchema = z.object({ ...base, email: z.string().trim().email('Email không hợp lệ'), teacherCode: z.string().trim().max(40).optional(), specialization: z.string().max(120).optional() });
const studentSchema = z.object({ ...base, studentCode: z.string().trim().regex(/^[A-Za-z0-9_.-]{2,40}$/, 'Mã học sinh 2–40 ký tự: chữ, số, . _ -'), email: z.string().trim().email('Email không hợp lệ').optional().or(z.literal('')), classId: z.string().optional() });

export function UsersPage({ role }: { role: Role }) {
  const isStudent = role === 'STUDENT';
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const params = new URLSearchParams({ role, page: String(page), ...(q ? { q } : {}), ...(status ? { status } : {}), ...(classId ? { classId } : {}) });
  const list = useQuery({ queryKey: ['users', params.toString()], queryFn: () => api<any>(`/api/admin/users?${params}`) });
  const classes = useQuery({ queryKey: ['admin-classes'], queryFn: () => api<any[]>('/api/admin/classes'), enabled: isStudent });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'lock' | 'unlock' | 'reset-password' }) => api<any>(`/api/admin/users/${id}/${action}`, { method: 'POST', body: {} }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const schema = isStudent ? studentSchema : teacherSchema;
  const form = useForm<any>({ resolver: zodResolver(schema) });
  const editForm = useForm<any>();
  const label = isStudent ? 'học sinh' : 'giáo viên';

  return (
    <>
      <PageHeader title={isStudent ? 'Học sinh' : 'Giáo viên'} description={isStudent ? 'Học sinh đăng nhập bằng mã học sinh (duy nhất trong trường).' : 'Giáo viên đăng nhập bằng email.'}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { form.reset({}); setCreating(true); }}>Thêm {label}</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={isStudent ? 'Tìm theo tên, mã HS, email…' : 'Tìm theo tên, email…'} className="min-w-[220px] flex-1" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-auto" aria-label="Lọc trạng thái">
            <option value="">Mọi trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="LOCKED">Đã khóa</option>
          </Select>
          {isStudent && (
            <Select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} className="w-auto" aria-label="Lọc lớp">
              <option value="">Mọi lớp</option>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </Select>
          )}
        </div>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data.items.length ? <EmptyState title={`Chưa có ${label} nào`} /> : (
          <Table head={isStudent ? ['Mã HS', 'Họ tên', 'Lớp', 'Email', 'Trạng thái', 'Đăng nhập gần nhất', ''] : ['Họ tên', 'Email', 'Mã GV', 'Phân công', 'Trạng thái', 'Đăng nhập gần nhất', '']}>
            {list.data.items.map((u: any) => (
              <tr key={u.id}>
                {isStudent ? (<><Td className="font-medium">{u.studentCode}</Td><Td>{u.fullName}</Td><Td>{u.classes.map((c: any) => c.code).join(', ') || '—'}</Td><Td className="text-ink-soft">{u.email ?? '—'}</Td></>)
                  : (<><Td className="font-medium">{u.fullName}</Td><Td className="text-ink-soft">{u.email}</Td><Td>{u.teacherCode ?? '—'}</Td><Td className="max-w-[240px] truncate text-[13px] text-ink-soft">{u.teaching.join(', ') || 'Chưa phân công'}</Td></>)}
                <Td>{u.status === 'ACTIVE' ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}{u.mustChangePassword && <Badge tone="warning" className="ml-1">MK tạm</Badge>}</Td>
                <Td className="whitespace-nowrap text-[13px] text-ink-soft">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Chưa đăng nhập'}</Td>
                <Td className="text-right">
                  <DM.Root>
                    <DM.Trigger className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100" aria-label={`Thao tác với ${u.fullName}`}><MoreHorizontal className="h-4 w-4" /></DM.Trigger>
                    <DM.Portal>
                      <DM.Content align="end" className="z-50 min-w-[180px] rounded-xl border border-line bg-white p-1 shadow-pop">
                        <MenuItem icon={<Pencil className="h-4 w-4" />} onSelect={() => { editForm.reset({ fullName: u.fullName, email: u.email ?? '', phone: u.phone ?? '', specialization: u.specialization ?? '' }); setEditing(u); }}>Sửa thông tin</MenuItem>
                        <MenuItem icon={<KeyRound className="h-4 w-4" />} onSelect={async () => {
                          if (!(await confirm({ title: `Đặt lại mật khẩu cho ${u.fullName}?`, description: 'Mọi phiên đăng nhập hiện tại sẽ bị thu hồi. Mật khẩu tạm mới hiển thị một lần.' }))) return;
                          const r = await act.mutateAsync({ id: u.id, action: 'reset-password' }); setTemp({ username: u.studentCode ?? u.username, password: r.temporaryPassword }); invalidate();
                        }}>Đặt lại mật khẩu</MenuItem>
                        {u.status === 'ACTIVE'
                          ? <MenuItem icon={<Lock className="h-4 w-4" />} danger onSelect={async () => { if (await confirm({ title: `Khóa tài khoản ${u.fullName}?`, description: 'Người dùng bị đăng xuất ngay và không thể đăng nhập cho tới khi được mở khóa.', tone: 'danger', confirmText: 'Khóa' })) { await act.mutateAsync({ id: u.id, action: 'lock' }); toast.success('Đã khóa tài khoản'); invalidate(); } }}>Khóa tài khoản</MenuItem>
                          : <MenuItem icon={<Unlock className="h-4 w-4" />} onSelect={async () => { await act.mutateAsync({ id: u.id, action: 'unlock' }); toast.success('Đã mở khóa'); invalidate(); }}>Mở khóa</MenuItem>}
                      </DM.Content>
                    </DM.Portal>
                  </DM.Root>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      </Card>

      <Dialog open={creating} onOpenChange={setCreating} title={`Thêm ${label}`} description="Mật khẩu tạm được tạo ngẫu nhiên và hiển thị một lần."
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Hủy</Button><Button type="submit" form="user-form" loading={form.formState.isSubmitting}>Tạo tài khoản</Button></>}>
        <form id="user-form" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(async (v) => {
          try {
            const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined));
            const r = await api<any>(`/api/admin/users/${isStudent ? 'students' : 'teachers'}`, { method: 'POST', body });
            setCreating(false); invalidate(); setTemp({ username: r.username, password: r.temporaryPassword });
          } catch (e) { toast.error(errorMessage(e)); }
        })}>
          <Field label="Họ và tên" required error={form.formState.errors.fullName?.message as string} className="sm:col-span-2"><Input {...form.register('fullName')} /></Field>
          {isStudent && <Field label="Mã học sinh" required error={form.formState.errors.studentCode?.message as string}><Input {...form.register('studentCode')} placeholder="VD: HS0021" /></Field>}
          <Field label="Email" required={!isStudent} error={form.formState.errors.email?.message as string}><Input type="email" {...form.register('email')} /></Field>
          {isStudent ? (
            <Field label="Lớp"><Select {...form.register('classId')}><option value="">— Chưa xếp lớp —</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}</Select></Field>
          ) : (<>
            <Field label="Mã giáo viên"><Input {...form.register('teacherCode')} /></Field>
            <Field label="Chuyên môn"><Input {...form.register('specialization')} /></Field>
          </>)}
          <Field label="Số điện thoại"><Input {...form.register('phone')} /></Field>
        </form>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title="Sửa thông tin"
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Hủy</Button><Button type="submit" form="edit-user" loading={editForm.formState.isSubmitting}>Lưu</Button></>}>
        <form id="edit-user" className="grid gap-4 sm:grid-cols-2" onSubmit={editForm.handleSubmit(async (v) => {
          try {
            const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
            await api(`/api/admin/users/${editing.id}`, { method: 'PATCH', body }); toast.success('Đã lưu'); setEditing(null); invalidate();
          } catch (e) { toast.error(errorMessage(e)); }
        })}>
          <Field label="Họ và tên" className="sm:col-span-2"><Input {...editForm.register('fullName', { required: true, minLength: 2 })} /></Field>
          <Field label="Email"><Input type="email" {...editForm.register('email')} /></Field>
          <Field label="Số điện thoại"><Input {...editForm.register('phone')} /></Field>
          {!isStudent && <Field label="Chuyên môn" className="sm:col-span-2"><Input {...editForm.register('specialization')} /></Field>}
        </form>
      </Dialog>
      <TempPasswordDialog value={temp} onClose={() => setTemp(null)} />
    </>
  );
}

function MenuItem({ children, icon, onSelect, danger }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DM.Item onSelect={onSelect} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-slate-50 focus:bg-slate-50 ${danger ? 'text-danger' : 'text-ink'}`}>
      {icon}{children}
    </DM.Item>
  );
}
