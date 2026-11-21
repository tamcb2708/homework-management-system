/** Provider abstraction (ai-grading-design §3). Only DisabledProvider is wired in non-test environments until D11 approval. */
export interface AnonymizedGradingInput {
  requestRef: string; // random, not linkable to internal ids
  question: string;
  referenceAnswer: string | null;
  criteria: { id: string; name: string; description: string | null; maxScore: number }[];
  answer: string;
  maxScore: number;
  scoreStep: number;
}

export interface ProviderResponse {
  raw: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  stopReason: string;
}

export interface AiGradingProvider {
  readonly name: 'disabled' | 'fake';
  gradeItem(input: AnonymizedGradingInput): Promise<ProviderResponse>;
}

export class AiDisabledError extends Error {
  constructor() { super('AI grading is disabled'); }
}

export class DisabledProvider implements AiGradingProvider {
  readonly name = 'disabled' as const;
  async gradeItem(): Promise<ProviderResponse> { throw new AiDisabledError(); }
}

/** Deterministic test double. Refuses to exist in production (D11.9). */
export class FakeProvider implements AiGradingProvider {
  readonly name = 'fake' as const;
  public calls: AnonymizedGradingInput[] = [];
  constructor(private readonly script: (i: AnonymizedGradingInput) => unknown = defaultScript) {
    if (process.env.NODE_ENV === 'production') throw new Error('FakeProvider is not allowed in production');
  }
  async gradeItem(input: AnonymizedGradingInput): Promise<ProviderResponse> {
    this.calls.push(input);
    const raw = this.script(input);
    if (raw instanceof Error) throw raw;
    return { raw, model: 'fake', inputTokens: Math.ceil(input.answer.length / 3), outputTokens: 200, latencyMs: 1, stopReason: 'end_turn' };
  }
}

function defaultScript(i: AnonymizedGradingInput) {
  return {
    suggested_score: i.criteria.reduce((s, c) => s + c.maxScore / 2, 0), max_score: i.maxScore, confidence: 0.5,
    criteria: i.criteria.map((c) => ({ criterion_id: c.id, score: c.maxScore / 2, feedback: 'Ví dụ' })),
    strengths: [], weaknesses: [], missing_points: [], overall_feedback: 'Ví dụ', needs_teacher_review: true,
  };
}

/** Local token estimate – deliberately NOT the provider's token-count API, which would send content out (ai-grading-design §10.2). */
export function estimateCostMicros(chars: number, maxOutputTokens: number, price: { inputPerMTok: number; outputPerMTok: number }): number {
  const inputTokens = Math.ceil((chars / 2.5) * 1.2) + 800; // Vietnamese ≈ 2.5 chars/token, +20% safety, +prompt overhead
  return Math.ceil((inputTokens * price.inputPerMTok + maxOutputTokens * price.outputPerMTok) / 1_000_000);
}
