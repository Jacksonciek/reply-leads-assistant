// LLM client interface + Gemini implementation (structured JSON output).
import { z } from 'zod';
import { INTENTS, type Extracted, type Intent } from '../../domain/routing';

export const LlmOutputSchema = z.object({
  intent: z.enum(INTENTS),
  extracted: z.object({
    visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
    arrival_time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().catch(null),
    session: z.enum(['S1', 'S2']).nullable().catch(null),
    guests: z.number().int().positive().nullable().catch(null),
    pa_preferred_time: z.string().nullable().catch(null),
  }),
  confidence: z.number().min(0).max(1),
  language: z.enum(['id', 'en', 'other']).catch('id'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).catch('neutral'),
  answer_in_kb: z.boolean().catch(false),
  reason: z.string().catch(''),
  draft: z.string().catch(''),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema> & { intent: Intent; extracted: Extracted };

export class LlmError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface LlmClient {
  classify(system: string, user: string): Promise<LlmOutput & { model: string }>;
  listModels?(): Promise<string[]>;
}

// Gemini responseSchema (OpenAPI subset).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: [...INTENTS] },
    extracted: {
      type: 'OBJECT',
      properties: {
        visit_date: { type: 'STRING', nullable: true },
        arrival_time: { type: 'STRING', nullable: true },
        session: { type: 'STRING', enum: ['S1', 'S2'], nullable: true },
        guests: { type: 'INTEGER', nullable: true },
        pa_preferred_time: { type: 'STRING', nullable: true },
      },
      required: ['visit_date', 'arrival_time', 'session', 'guests', 'pa_preferred_time'],
    },
    confidence: { type: 'NUMBER' },
    language: { type: 'STRING', enum: ['id', 'en', 'other'] },
    sentiment: { type: 'STRING', enum: ['positive', 'neutral', 'negative'] },
    answer_in_kb: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
    draft: { type: 'STRING' },
  },
  required: ['intent', 'extracted', 'confidence', 'language', 'sentiment', 'answer_in_kb', 'reason', 'draft'],
};

export interface GeminiOpts {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class GeminiClient implements LlmClient {
  private fetchFn: typeof fetch;
  private base: string;
  constructor(private o: GeminiOpts) {
    this.fetchFn = o.fetchFn ?? fetch.bind(globalThis);
    this.base = o.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  private async once(model: string, system: string, user: string): Promise<LlmOutput> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs ?? 15000);
    try {
      const res = await this.fetchFn(`${this.base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.o.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.25, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
        }),
      });
      if (!res.ok) throw new LlmError(res.status, `Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return LlmOutputSchema.parse(JSON.parse(text)) as LlmOutput;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Primary model, 1 retry, then fallback model. Throws if all fail. */
  async classify(system: string, user: string) {
    const attempts = [this.o.model, this.o.model, this.o.fallbackModel].filter(Boolean) as string[];
    let last: unknown;
    for (const m of attempts) {
      try { return { ...(await this.once(m, system, user)), model: m }; } catch (e) { last = e; }
    }
    throw last instanceof Error ? last : new Error('LLM gagal');
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetchFn(`${this.base}/models?pageSize=200`, { headers: { 'x-goog-api-key': this.o.apiKey } });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    return (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  }
}
