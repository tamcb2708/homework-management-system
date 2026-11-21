'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, Table, Td } from '@/components/ui/blocks';
import { Card } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export default function PlatformAudit() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['platform-audit', page], queryFn: () => api<any>(`/api/platform/audit-logs?page=${page}`) });
  return (
    <>
      <PageHeader title="Nhật ký nền tảng" description="Mọi thao tác của Platform Admin (không thể sửa hoặc xóa)." />
      <Card>
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorState error={q.error} /> : !q.data.items.length ? <EmptyState title="Chưa có nhật ký" /> : (
          <Table head={['Thời gian', 'Hành động', 'Đối tượng', 'IP']}>
            {q.data.items.map((l: any) => (
              <tr key={l.id}><Td className="whitespace-nowrap text-ink-soft">{fmtDateTime(l.createdAt)}</Td><Td><code className="text-xs">{l.action}</code></Td><Td className="text-xs text-ink-soft">{l.resourceType ?? ''} {l.targetTenantId ? `· tenant ${l.targetTenantId.slice(0, 8)}` : ''}</Td><Td className="text-xs">{l.ip}</Td></tr>
            ))}
          </Table>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />}
      </Card>
    </>
  );
}
