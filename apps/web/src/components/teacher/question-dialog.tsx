'use client';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileUpload } from '@/components/content/file-upload';
import { MathText } from '@/components/content/math-text';
import type { ViewFile } from '@/components/content/answer-view';
import { Dialog } from '@/components/ui/dialog';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { QUESTION_TYPE } from '@/lib/format';

interface Opt { id?: string; content: string; isCorrect: boolean }
interface Crit { name: string; maxPoints: number; description?: string }

export function QuestionDialog({ open, onOpenChange, assignmentId, question, locked, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; assignmentId: string; question?: any; locked: boolean; onSaved: (a: any) => void;
}) {
  const [type, setType] = useState('SINGLE_CHOICE');
  const [content, setContent] = useState('');
  const [points, setPoints] = useState(1);
  const [required, setRequired] = useState(true);
  const [options, setOptions] = useState<Opt[]>([]);
  const [scoring, setScoring] = useState('ALL_OR_NOTHING');
  const [accepted, setAccepted] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [ignoreDiacritics, setIgnoreDiacritics] = useState(false);
  const [tolerance, setTolerance] = useState('');
  const [zeroIfNoMatch, setZero] = useState(false);
  const [maxFiles, setMaxFiles] = useState(3);
  const [reference, setReference] = useState('');
  const [explanation, setExplanation] = useState('');
  const [criteria, setCriteria] = useState<Crit[]>([]);
  const [files, setFiles] = useState<ViewFile[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = question;
    setType(q?.type ?? 'SINGLE_CHOICE'); setContent(q?.content ?? ''); setPoints(q?.points ?? 1); setRequired(q?.isRequired ?? true);
    setOptions(q?.options?.length ? q.options.map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })) : [{ content: '', isCorrect: true }, { content: '', isCorrect: false }]);
    setScoring(q?.config?.scoring ?? 'ALL_OR_NOTHING'); setAccepted((q?.config?.accepted ?? []).join('\n'));
    setCaseSensitive(!!q?.config?.caseSensitive); setIgnoreDiacritics(!!q?.config?.ignoreDiacritics); setTolerance(q?.config?.numericTolerance ?? '');
    setZero(!!q?.config?.zeroIfNoMatch); setMaxFiles(q?.config?.maxFiles ?? 3); setReference(q?.referenceAnswer ?? ''); setExplanation(q?.explanation ?? '');
    setCriteria(q?.rubric?.criteria?.map((c: any) => ({ name: c.name, maxPoints: c.maxPoints, description: c.description ?? '' })) ?? []);
    setFiles(q?.attachments ?? []);
  }, [open, question]);

  useEffect(() => {
    if (type === 'TRUE_FALSE' && !(options.length === 2 && options[0]?.content === 'Đúng')) {
      if (!locked) setOptions([{ content: 'Đúng', isCorrect: true }, { content: 'Sai', isCorrect: false }]);
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const isChoice = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(type);
  const rubricTotal = Math.round(criteria.reduce((s, c) => s + Number(c.maxPoints || 0), 0) * 100) / 100;

  const save = async () => {
    if (!content.trim()) return toast.error('Nhập nội dung câu hỏi.');
    if (criteria.length && rubricTotal !== Number(points)) return toast.error(`Tổng điểm tiêu chí (${rubricTotal}) phải bằng điểm câu hỏi (${points}).`);
    const config: Record<string, unknown> = {};
    if (type === 'MULTIPLE_CHOICE') config.scoring = scoring;
    if (type === 'SHORT_ANSWER') Object.assign(config, { accepted: accepted.split('\n').map((s) => s.trim()).filter(Boolean), caseSensitive, ignoreDiacritics, numericTolerance: tolerance === '' ? null : Number(tolerance), zeroIfNoMatch });
    if (type === 'FILE_UPLOAD') config.maxFiles = Number(maxFiles);
    const body = {
      type, content: content.trim(), points: Number(points), isRequired: required, config,
      options: isChoice ? options.map((o) => ({ ...(o.id ? { id: o.id } : {}), content: o.content.trim(), isCorrect: o.isCorrect })) : [],
      referenceAnswer: reference.trim() || null, explanation: explanation.trim() || null,
      rubric: ['ESSAY', 'SHORT_ANSWER', 'FILE_UPLOAD'].includes(type) ? (criteria.length ? { criteria: criteria.map((c) => ({ name: c.name.trim(), maxPoints: Number(c.maxPoints), description: c.description?.trim() || undefined })) } : null) : undefined,
      attachmentFileIds: files.map((f) => f.id),
    };
    if (isChoice && options.some((o) => !o.content.trim())) return toast.error('Các lựa chọn không được để trống.');
    setBusy(true);
    try {
      const a = question
        ? await api(`/api/teacher/questions/${question.id}`, { method: 'PUT', body })
        : await api(`/api/teacher/assignments/${assignmentId}/questions`, { method: 'POST', body });
      toast.success(question ? 'Đã cập nhật câu hỏi' : 'Đã thêm câu hỏi');
      onSaved(a); onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={question ? `Sửa câu ${question.ordinal}` : 'Thêm câu hỏi'}
      description={locked ? 'Đã có bài nộp: chỉ sửa được nội dung, đáp án đúng (hệ thống tự chấm lại) và giải thích.' : 'Hỗ trợ công thức toán: viết trong $...$, ví dụ $\\frac{1}{2}$.'}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button loading={busy} onClick={save} data-testid="save-question">Lưu câu hỏi</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Loại câu hỏi" className="sm:col-span-2"><Select value={type} disabled={locked} onChange={(e) => setType(e.target.value)} data-testid="question-type">{Object.entries(QUESTION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Điểm"><Input type="number" min={0} step={0.25} value={points} disabled={locked} onChange={(e) => setPoints(Number(e.target.value))} data-testid="question-points" /></Field>
        </div>
        <Field label="Nội dung câu hỏi" required>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} data-testid="question-content" />
        </Field>
        {content.includes('$') && <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="mr-2 text-xs text-ink-soft">Xem trước:</span><MathText text={content} /></div>}

        {isChoice && (
          <Field label={type === 'MULTIPLE_CHOICE' ? 'Lựa chọn (đánh dấu tất cả đáp án đúng)' : 'Lựa chọn (chọn một đáp án đúng)'}>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type={type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'} name="correct" checked={o.isCorrect} aria-label={`Đáp án đúng ${i + 1}`} className="h-4 w-4 accent-[#5a5fe0]"
                    onChange={(e) => setOptions(options.map((x, j) => type === 'MULTIPLE_CHOICE' ? (j === i ? { ...x, isCorrect: e.target.checked } : x) : { ...x, isCorrect: j === i }))} />
                  <Input value={o.content} disabled={type === 'TRUE_FALSE'} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} placeholder={`Lựa chọn ${String.fromCharCode(65 + i)}`} data-testid={`option-${i}`} />
                  {!locked && type !== 'TRUE_FALSE' && options.length > 2 && <Button size="icon" variant="ghost" aria-label="Xóa lựa chọn" onClick={() => setOptions(options.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              {!locked && type !== 'TRUE_FALSE' && options.length < 10 && <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setOptions([...options, { content: '', isCorrect: false }])}>Thêm lựa chọn</Button>}
            </div>
          </Field>
        )}
        {type === 'MULTIPLE_CHOICE' && (
          <Field label="Cách tính điểm"><Select value={scoring} onChange={(e) => setScoring(e.target.value)}><option value="ALL_OR_NOTHING">Đúng hết mới được điểm</option><option value="PARTIAL">Điểm từng phần (trừ khi chọn sai)</option></Select></Field>
        )}
        {type === 'SHORT_ANSWER' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Đáp án chấp nhận (mỗi dòng một đáp án)" hint="Để trống: giáo viên chấm tay." className="sm:col-span-2"><Textarea value={accepted} onChange={(e) => setAccepted(e.target.value)} rows={3} /></Field>
            <Field label="Sai số cho phép (đáp án số)"><Input type="number" step="any" min={0} value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="VD: 0.01" /></Field>
            <div className="space-y-2 pt-6">
              <Checkbox label="Phân biệt hoa thường" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
              <Checkbox label="Bỏ qua dấu tiếng Việt" checked={ignoreDiacritics} onChange={(e) => setIgnoreDiacritics(e.target.checked)} />
              <Checkbox label="Không khớp thì 0 điểm (không cần chấm tay)" checked={zeroIfNoMatch} onChange={(e) => setZero(e.target.checked)} />
            </div>
          </div>
        )}
        {type === 'FILE_UPLOAD' && <Field label="Số tệp tối đa"><Input type="number" min={1} max={10} value={maxFiles} onChange={(e) => setMaxFiles(Number(e.target.value))} className="w-32" /></Field>}
        {['ESSAY', 'SHORT_ANSWER', 'FILE_UPLOAD'].includes(type) && (
          <>
            {type === 'ESSAY' && <Field label="Đáp án tham khảo (chỉ giáo viên thấy)"><Textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={3} /></Field>}
            <Field label={`Rubric chấm điểm ${criteria.length ? `(tổng ${rubricTotal}/${points})` : '(tùy chọn)'}`}>
              <div className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2">
                    <Input value={c.name} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Tiêu chí, VD: Nội dung" />
                    <Input type="number" min={0.25} step={0.25} value={c.maxPoints} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, maxPoints: Number(e.target.value) } : x)))} aria-label="Điểm tối đa" />
                    <Button size="icon" variant="ghost" aria-label="Xóa tiêu chí" onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setCriteria([...criteria, { name: '', maxPoints: 1 }])}>Thêm tiêu chí</Button>
              </div>
            </Field>
          </>
        )}
        <Field label="Giải thích / lời giải (hiển thị theo chính sách xem đáp án)"><Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} /></Field>
        <Field label="Hình ảnh / tệp đính kèm cho câu hỏi"><FileUpload files={files} onChange={setFiles} purpose="QUESTION_MEDIA" max={5} /></Field>
        <Checkbox label="Câu bắt buộc trả lời" checked={required} onChange={(e) => setRequired(e.target.checked)} />
      </div>
    </Dialog>
  );
}
