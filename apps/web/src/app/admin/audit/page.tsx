'use client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput, Table, Td } from '@/components/ui/blocks';
import { Badge, Card, Checkbox } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

function Audit() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [sensitive, setSensitive] = useState(params.get('sensitive') === 'true');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['audit', q, sensitive, page], queryFn: () => api<any>(`/api/admin/audit-logs?page=${page}&sensitive=${sensitive}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <>
      <PageHeader title="Nhật ký hoạt động" description="Nhật ký chỉ ghi thêm, không thể sửa hoặc xóa. Bao gồm đăng nhập, thay đổi dữ liệu, chỉnh sửa điểm và truy cập dữ liệu nhạy cảm." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Lọc theo hành động, ví dụ grade, user.lock…" className="min-w-[240px] flex-1" />
          <Checkbox label="Chỉ truy cập nhạy cảm" checked={sensitive} onChange={(e) => { setSensitive(e.target.checked); setPage(1); }} />
        </div>
        {list.isLoading ? <LoadingBlock /> : list.error ? <ErrorState error={list.error} /> : !list.data.items.length ? <EmptyState title="Không có bản ghi phù hợp" /> : (
          <Table head={['Thời gian', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Lý do', 'IP']}>
            {list.data.items.map((l: any) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-[13px] text-ink-soft">{fmtDateTime(l.createdAt)}</Td>
                <Td className="text-[13px]">{l.actor ? l.actor.fullName : l.actorType === 'SYSTEM' ? 'Hệ thống' : 'Nền tảng'}</Td>
                <Td><code className="text-xs">{l.action}</code> {l.isSensitive && <Badge tone="danger">nhạy cảm</Badge>}</Td>
                <Td className="text-xs text-ink-soft">{l.resourceType}{l.resourceId ? ` · ${String(l.resourceId).slice(0, 8)}` : ''}</Td>
                <Td className="max-w-[240px] truncate text-[13px]">{l.reason ?? ''}</Td>
                <Td className="text-xs text-ink-soft">{l.ip}</Td>
              </tr>
            ))}
          </Table>
        )}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      </Card>
    </>
  );
}

export default function Page() { return <Suspense><Audit /></Suspense>; }
