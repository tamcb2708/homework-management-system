'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Building2, ClipboardList, GraduationCap, Inbox, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState, LoadingStats, PageHeader, StatCard, Table, Td } from '@/components/ui/blocks';
import { Badge, Card, CardHeader, Checkbox } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';

export default function PlatformDashboard() {
  const q = useQuery({ queryKey: ['platform-stats'], queryFn: () => api<any>('/api/platform/stats') });
  const ai = useQuery({ queryKey: ['platform-ai'], queryFn: () => api<{ killSwitchEnabled: boolean; provider: string }>('/api/platform/settings/ai') });
  const qc = useQueryClient();
  const confirm = useConfirm();
  const setAi = useMutation({
    mutationFn: (enabled: boolean) => api('/api/platform/settings/ai', { method: 'PUT', body: { enabled } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-ai'] }); toast.success('Đã cập nhật công tắc AI.'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Tổng quan nền tảng" description="Số liệu tổng hợp của tất cả các trường (không hiển thị dữ liệu bài làm)." />
      {!d ? <LoadingStats n={6} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Trường học" value={d.tenants.total} hint={`${d.tenants.active} đang hoạt động · ${d.tenants.suspended} tạm ngưng`} icon={<Building2 className="h-5 w-5" />} />
          <StatCard label="Người dùng" value={d.totals.users} icon={<Users className="h-5 w-5" />} tone="info" />
          <StatCard label="Giáo viên" value={d.totals.teachers} icon={<Users className="h-5 w-5" />} tone="neutral" />
          <StatCard label="Học sinh" value={d.totals.students} icon={<GraduationCap className="h-5 w-5" />} tone="success" />
          <StatCard label="Bài tập" value={d.totals.assignments} icon={<ClipboardList className="h-5 w-5" />} tone="warning" />
          <StatCard label="Lượt nộp bài" value={d.totals.submissions} icon={<Inbox className="h-5 w-5" />} />
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Theo trường" />
          <Table head={['Trường', 'Mã', 'Trạng thái', 'GV', 'HS', 'Lớp', 'Bài tập', 'Lượt nộp']}>
            {d?.perTenant.map((t: any) => (
              <tr key={t.id}>
                <Td className="font-medium">{t.name}</Td><Td><code className="text-xs">{t.slug}</code></Td>
                <Td><Badge tone={t.status === 'ACTIVE' ? 'success' : 'danger'}>{t.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm ngưng'}</Badge></Td>
                <Td>{t.teachers}</Td><Td>{t.students}</Td><Td>{t.classes}</Td><Td>{t.assignments}</Td><Td>{t.submissions}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title="AI chấm bài" description="Quyết định D11: chưa gửi dữ liệu học sinh tới nhà cung cấp AI." />
          <div className="space-y-4 p-5 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-ink-soft"><Bot className="h-5 w-5" /></div>
              <div>
                <div className="font-medium">Nhà cung cấp: <code>{ai.data?.provider ?? '…'}</code></div>
                <div className="text-ink-soft">{ai.data?.provider === 'disabled' ? 'AI đang TẮT ở cấu hình máy chủ.' : 'Đã cấu hình nhà cung cấp.'}</div>
              </div>
            </div>
            <Checkbox label="Bật công tắc AI của nền tảng (G1)" checked={!!ai.data?.killSwitchEnabled} disabled={!ai.data || setAi.isPending}
              onChange={async (e) => {
                const enabled = e.target.checked;
                if (enabled && !(await confirm({ title: 'Bật công tắc AI?', description: 'Công tắc này chỉ là một trong năm cổng. Khi nhà cung cấp vẫn là "disabled", không có dữ liệu nào được gửi đi.' }))) return;
                setAi.mutate(enabled);
              }} />
          </div>
        </Card>
      </div>
    </>
  );
}
