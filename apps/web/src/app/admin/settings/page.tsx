'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/ui/blocks';
import { Button, Card, CardHeader, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tenant-settings'], queryFn: () => api<any>('/api/admin/settings') });
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (q.data) setForm({ fileAllowedTypes: q.data.fileAllowedTypes, fileMaxMb: q.data.fileMaxMb, submitGraceSeconds: q.data.submitGraceSeconds, scoreStep: q.data.scoreStep }); }, [q.data]);
  if (q.isLoading || !form) return <LoadingBlock rows={6} />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Cấu hình trường" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Bài nộp & tệp" description="Áp dụng cho mọi bài tập của trường." />
          <div className="space-y-5 p-5">
            <Field label="Định dạng tệp được phép">
              <div className="flex flex-wrap gap-4 pt-1">
                {d.fileCeiling.map((t: string) => (
                  <Checkbox key={t} label={t.toUpperCase()} checked={form.fileAllowedTypes.includes(t)}
                    onChange={(e) => setForm({ ...form, fileAllowedTypes: e.target.checked ? [...form.fileAllowedTypes, t] : form.fileAllowedTypes.filter((x: string) => x !== t) })} />
                ))}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Dung lượng tối đa (MB)"><Input type="number" min={1} max={50} value={form.fileMaxMb} onChange={(e) => setForm({ ...form, fileMaxMb: Number(e.target.value) })} /></Field>
              <Field label="Thời gian bù trễ khi nộp (giây)" hint="0–120"><Input type="number" min={0} max={120} value={form.submitGraceSeconds} onChange={(e) => setForm({ ...form, submitGraceSeconds: Number(e.target.value) })} /></Field>
              <Field label="Bước điểm"><Select value={form.scoreStep} onChange={(e) => setForm({ ...form, scoreStep: Number(e.target.value) })}>{[0.1, 0.25, 0.5, 1].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
            </div>
            <Button loading={saving} onClick={async () => {
              setSaving(true);
              try { await api('/api/admin/settings', { method: 'PATCH', body: form }); toast.success('Đã lưu cấu hình'); qc.invalidateQueries({ queryKey: ['tenant-settings'] }); }
              catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
            }}>Lưu cấu hình</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="AI hỗ trợ chấm bài" description="Theo quyết định D11, chưa gửi dữ liệu học sinh tới Anthropic khi chưa có phê duyệt chính thức." />
          <div className="space-y-3 p-5">
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
              <span>AI chỉ chạy khi <b>tất cả</b> các cổng dưới đây mở và giáo viên chủ động kích hoạt. Kết quả AI luôn là điểm đề xuất và phải được giáo viên duyệt.</span>
            </div>
            <ul className="space-y-2">
              {d.ai.gates.map((g: any) => (
                <li key={g.code} className="flex items-start gap-2.5 text-sm">
                  {g.open ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <span><b>{g.code}</b> · {g.label}{!g.open && g.reason && <span className="block text-[13px] text-ink-soft">{g.reason}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
