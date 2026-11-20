'use client';
import { Award, Bot, MessageSquareText } from 'lucide-react';
import { AnswerView } from '@/components/content/answer-view';
import { MathText } from '@/components/content/math-text';
import { Badge, Card, CardHeader, Select } from '@/components/ui/primitives';
import { fmtDateTime, fmtScore, QUESTION_TYPE } from '@/lib/format';

export function ResultView({ r, onVersion }: { r: any; onVersion: (v: number) => void }) {
  const weak = r.questions.filter((q: any) => q.isMarkedWrong);
  return (
    <div className="space-y-4" data-testid="result-view">
      <Card className="flex flex-wrap items-center gap-6 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success"><Award className="h-7 w-7" /></div>
          <div><div className="text-[13px] text-ink-soft">Điểm đạt được</div><div className="text-3xl font-semibold tabular-nums" data-testid="result-score">{fmtScore(r.earnedScore)}<span className="text-lg text-ink-soft">/{fmtScore(r.maxScore)}</span></div></div>
        </div>
        {r.passed !== null && <Badge tone={r.passed ? 'success' : 'danger'} className="text-sm">{r.passed ? 'Đạt yêu cầu' : 'Chưa đạt'}</Badge>}
        <div className="text-[13px] text-ink-soft">Lần nộp {r.versionNo} · nộp {fmtDateTime(r.submittedAt)}{r.isLate ? ' (muộn)' : ''} · công bố {fmtDateTime(r.publishedAt)}</div>
        {r.publishedVersions.length > 1 && <Select className="ml-auto w-auto" value={r.versionNo} onChange={(e) => onVersion(Number(e.target.value))} aria-label="Lần nộp">{r.publishedVersions.map((v: any) => <option key={v.versionNo} value={v.versionNo}>Lần {v.versionNo}: {fmtScore(v.earnedScore)} điểm</option>)}</Select>}
      </Card>
      {(r.teacherFeedback || r.aiFeedback) && (
        <Card>
          <CardHeader title="Nhận xét" />
          <div className="space-y-3 p-5 text-[15px]">
            {r.teacherFeedback && <div className="flex gap-3"><MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="whitespace-pre-line" data-testid="teacher-feedback">{r.teacherFeedback}</p></div>}
            {r.aiFeedback && <div className="flex gap-3 rounded-xl bg-slate-50 p-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" /><div><div className="text-xs text-ink-soft">Nhận xét AI (đã được giáo viên duyệt)</div><p className="whitespace-pre-line">{r.aiFeedback}</p></div></div>}
          </div>
        </Card>
      )}
      {weak.length > 0 && <Card className="p-5 text-sm"><span className="font-medium">Cần cải thiện:</span> câu {weak.map((q: any) => q.ordinal).join(', ')}.</Card>}
      {r.questions.map((q: any) => (
        <Card key={q.id} className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Câu {q.ordinal}</span><Badge tone="info">{QUESTION_TYPE[q.type]}</Badge>
            <Badge tone={q.earnedScore === q.maxScore ? 'success' : q.earnedScore ? 'warning' : 'danger'}>{fmtScore(q.earnedScore)}/{fmtScore(q.maxScore)} điểm</Badge>
          </div>
          <div className="mb-3 text-[15px]"><MathText text={q.content} /></div>
          <AnswerView type={q.type} answer={q.answer} options={q.options} files={q.files} />
          {q.acceptedAnswers?.length > 0 && <p className="mt-2 text-[13px] text-success">Đáp án: {q.acceptedAnswers.join(' | ')}</p>}
          {q.criteria.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-[13px]">
              {q.criteria.map((c: any) => <li key={c.name} className="flex justify-between gap-3"><span>{c.name}{c.feedback ? ` – ${c.feedback}` : ''}</span><span className="tabular-nums">{fmtScore(c.earnedScore)}/{fmtScore(c.maxScore)}</span></li>)}
            </ul>
          )}
          {q.feedback && <p className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-[13px]"><b>Giáo viên:</b> {q.feedback}</p>}
          {q.explanation && <p className="mt-2 text-[13px] text-ink-soft"><b>Giải thích:</b> <MathText text={q.explanation} /></p>}
        </Card>
      ))}
      {!r.answerKeyVisible && <p className="text-center text-[13px] text-ink-soft">Đáp án đúng chưa được hiển thị theo cài đặt của giáo viên.</p>}
    </div>
  );
}
