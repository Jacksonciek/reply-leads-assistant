// Reply pipeline for a room (Section 11.2–11.6): pre-check -> LLM -> code routing -> template/fixed/LLM draft -> guardrail.
import { buildSystemPrompt, buildUserPrompt, HISTORY_LIMIT, type HistoryItem, type SafeLeadContext } from '../../../config/llm-prompt';
import { OPT_OUT_PHRASE_ALLOWED } from '../../../config/templates';
import type { EventCode, EventConfig } from '../../../config/events';
import { checkDraft, fallbackFor } from '../../domain/guardrails';
import { sapaanFor } from '../../domain/names';
import { renderForLead } from '../../domain/next-message';
import { getSalam } from '../../domain/time';
import { hasMedia, isOptOut, isShortAck } from '../../domain/precheck';
import { redactText, stripNames } from '../../domain/redact';
import { mergeExtracted, routeIntent, type AnyIntent, type Extracted, type Suggestion } from '../../domain/routing';
import type { TemplateMap } from '../../domain/templates';
import type { Faq, Lead, Message } from '../../domain/types';
import { LlmError, type LlmClient, type LlmOutput } from './llm';

export interface GenerateInput {
  lead: Lead;
  messages: Message[]; // non-deleted, sorted
  templates: TemplateMap;
  faqs: Faq[];
  events: Record<EventCode, EventConfig>;
  llm: LlmClient | null;
  now: Date;
  instruction?: string;
}

export interface GenerateResult {
  intent: AnyIntent;
  confidence: number;
  reason: string;
  extracted: Partial<Extracted>;
  draft_text: string;
  draft_source: 'TEMPLATE' | 'LLM' | 'FIXED' | 'NONE';
  template_code: string;
  original_text: string; // LLM draft rejected by the guardrail
  flags: string[];
  notes: string[];
  suggestion: Suggestion;
  after_msg_id: string;
  llm_payload?: { system: string; user: string }; // for tests only (not persisted)
}

export class GenerateError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Client messages after Jackson's last outbound message. */
export function pendingInbound(messages: Message[]): Message[] {
  const out: Message[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].direction === 'IN'; i--) out.unshift(messages[i]);
  return out;
}

export function safeContext(lead: Lead, caseCode: string): SafeLeadContext {
  return {
    sapaan: sapaanFor(lead.gender).sapaan,
    nama: lead.call_name,
    event: lead.event,
    case_code: caseCode,
    visit_date: lead.visit_date,
    arrival_time: lead.arrival_time || null,
    session: lead.session === 'S1' || lead.session === 'S2' ? lead.session : null,
    guests: lead.guests != null ? String(lead.guests) : lead.guests_bucket === '3+' ? '3+' : null,
  };
}

/** Build the LLM payload. Contains no phone, email, full name or agent name. */
export function buildLlmPayload(lead: Lead, messages: Message[], newMsgs: Message[], events: Record<EventCode, EventConfig>, faqs: Faq[], instruction?: string, now?: Date) {
  const sensitive = [lead.full_name, lead.agent_name, lead.email, lead.phone_e164].filter(Boolean);
  const clean = (t: string) => stripNames(redactText(t), sensitive);
  const newIds = new Set(newMsgs.map((m) => m.msg_id));
  const history: HistoryItem[] = messages.filter((m) => !newIds.has(m.msg_id)).slice(-HISTORY_LIMIT)
    .map((m) => ({ dari: m.direction === 'IN' ? 'klien' : 'jackson', teks: clean(m.text) }));
  const approved = faqs.filter((f) => f.approved && (f.event === 'ALL' || f.event === lead.event));
  const system = buildSystemPrompt(events[lead.event], approved);
  const user = buildUserPrompt(safeContext(lead, lead.case_code), history, newMsgs.map((m) => clean(m.text)), instruction ? clean(instruction) : undefined, now ? getSalam(now) : undefined);
  return { system, user };
}

export async function generateReply(input: GenerateInput): Promise<GenerateResult> {
  const { lead, messages, templates, events, now } = input;
  const newMsgs = pendingInbound(messages);
  if (!newMsgs.length) return followUp(input);
  const joined = newMsgs.map((m) => m.text).join('\n');
  const base: Omit<GenerateResult, 'intent' | 'draft_text' | 'draft_source' | 'template_code'> = {
    confidence: 1, reason: '', extracted: {}, original_text: '', flags: [], notes: [], suggestion: {},
    after_msg_id: newMsgs[newMsgs.length - 1].msg_id,
  };
  const render = (code: string, l: Lead = lead) => {
    const r = renderForLead(code, l, templates, now, events);
    if (r.error) throw new GenerateError('render', r.error);
    return r.text!;
  };
  const fixed = (intent: AnyIntent, code: string, extra: Partial<GenerateResult> = {}): GenerateResult =>
    ({ ...base, intent, draft_text: render(code), draft_source: 'FIXED', template_code: code, ...extra });

  // 1. Opt-out regex: no LLM.
  if (isOptOut(joined)) {
    return fixed('OPT_OUT', 'OPT_OUT', { reason: 'Opt-out keyword detected', suggestion: { state: 'OPTED_OUT', opt_out: true }, flags: ['opt_out'] });
  }
  // 2. Short acknowledgement.
  if (isShortAck(joined)) {
    if (lead.state === 'CONFIRMED') {
      return { ...base, intent: 'SMALL_TALK', draft_text: '', draft_source: 'NONE', template_code: '', reason: 'Closing reply from an already confirmed client', notes: ['No reply needed'] };
    }
    const code = lead.event === 'ROADSHOW' ? 'SOFT_CONFIRM-A' : 'SOFT_CONFIRM-B';
    const hasData = lead.event === 'ROADSHOW' ? !!lead.visit_date : lead.session === 'S1' || lead.session === 'S2';
    if (hasData) {
      return { ...base, intent: 'SOFT_ACK', draft_text: render(code), draft_source: 'TEMPLATE', template_code: code, reason: 'Short reply, not an attendance confirmation: ask to confirm', notes: ['Status unchanged'] };
    }
    // No date/session yet: LLM drafts the same pattern asking for it.
    input = { ...input, instruction: [input.instruction, 'Klien hanya membalas singkat (belum menyatakan hadir). Buat draft pola SOFT_CONFIRM: ucapkan sama-sama lalu tanyakan dengan sopan ' + (lead.event === 'ROADSHOW' ? 'hari kunjungan yang dipilih (23–29 November)' : 'sesi yang dipilih (11.00–13.00 atau 15.00–17.00)') + '. Jangan menulis bahwa kehadiran sudah dicatat.'].filter(Boolean).join(' ') };
  }
  // 3. Media.
  if (hasMedia(joined)) {
    base.flags.push('media');
    base.notes.push('Client sent media, check WhatsApp');
    if (joined.replace(/<[^>]*>|\b\w+ omitted\b/gi, '').trim().length < 3) {
      return fixed('MEDIA', 'HOLD', { reason: 'Client only sent media' });
    }
  }

  // 4. LLM.
  if (!input.llm) {
    return fixed('OTHER', 'HOLD', { reason: 'LLM not configured (GEMINI_API_KEY is empty)', flags: [...base.flags, 'llm_unavailable'], notes: [...base.notes, 'LLM unavailable: using the HOLD text'] });
  }
  const payload = buildLlmPayload(lead, messages, newMsgs, events, input.faqs, input.instruction, now);
  let out: LlmOutput & { model: string };
  try {
    out = await input.llm.classify(payload.system, payload.user);
  } catch (e) {
    const quota = e instanceof LlmError && e.status === 429;
    return fixed('OTHER', 'HOLD', {
      reason: quota ? 'Gemini quota exhausted (429)' : `LLM failed: ${(e as Error).message.slice(0, 120)}`,
      flags: [...base.flags, quota ? 'llm_quota' : 'llm_error'],
      notes: [...base.notes, quota ? 'Kuota Gemini habis. Template dan teks tetap tetap bisa dipakai.' : 'LLM gagal: memakai teks HOLD'],
      llm_payload: payload,
    });
  }

  const routing = routeIntent(out, lead);
  const res: GenerateResult = {
    ...base, intent: out.intent, confidence: out.confidence, reason: out.reason, extracted: out.extracted,
    draft_text: '', draft_source: 'LLM', template_code: '', notes: [...base.notes, ...routing.notes],
    suggestion: routing.suggestion, flags: [...base.flags, ...(routing.needsAttention ? ['needs_attention'] : [])],
    llm_payload: payload,
  };
  const plan = routing.draft;
  if (plan.kind === 'NONE') { res.draft_source = 'NONE'; res.notes.push(plan.note); return res; }
  if (plan.kind === 'FIXED') { res.draft_source = 'FIXED'; res.template_code = plan.code; res.draft_text = render(plan.code); }
  else if (plan.kind === 'TEMPLATE') {
    res.draft_source = 'TEMPLATE'; res.template_code = plan.code;
    const merged = mergeExtracted(lead, out.extracted);
    res.draft_text = render(plan.code, merged);
    if (plan.attachPoster) res.flags.push('attach_poster');
  } else {
    const intentNoAttendance = !['CONFIRM_ATTEND', 'PROVIDE_DETAILS', 'CHANGE_SCHEDULE'].includes(out.intent);
    const g = checkDraft(out.draft, {
      intent: out.intent,
      projectLink: events.JESSELTON.project_link,
      allowOptOutPhrase: false,
      attendanceStated: !intentNoAttendance && out.confidence >= 0.75,
    });
    if (g.ok) res.draft_text = out.draft.trim();
    else {
      const code = fallbackFor(g.flags, out.intent);
      const r = renderForLead(code, lead, templates, now, events);
      res.original_text = out.draft;
      res.flags.push(...g.flags.map((f) => `guardrail:${f}`));
      res.draft_source = 'FIXED';
      res.template_code = code;
      res.draft_text = r.text ?? render('HOLD');
      if (!r.text) res.template_code = 'HOLD';
      res.notes.push('LLM draft rejected by guardrail and replaced with fixed text');
    }
  }
  return res;
}

/** The last message is Jackson's: write another message from him, following his request. */
async function followUp(input: GenerateInput): Promise<GenerateResult> {
  const { lead, messages, events, now } = input;
  const last = messages[messages.length - 1];
  if (!last) throw new GenerateError('no_messages', 'No messages yet. Send the first message from the template.');
  if (!input.instruction?.trim()) throw new GenerateError('no_instruction', 'The last message is yours. Type what you want to send next, then Generate.');
  if (!input.llm) throw new GenerateError('llm_unavailable', 'LLM not configured (GEMINI_API_KEY is empty)');
  const instruction = `Klien belum membalas sejak pesan terakhir Jackson. Tulis pesan lanjutan dari Jackson untuk klien ini sesuai permintaan: ${input.instruction.trim()}`;
  const payload = buildLlmPayload(lead, messages, [], events, input.faqs, instruction, now);
  const res: GenerateResult = {
    intent: 'OTHER', confidence: 1, reason: 'Follow-up message (client has not replied)', extracted: {}, draft_text: '', draft_source: 'LLM',
    template_code: '', original_text: '', flags: [], notes: [], suggestion: {}, after_msg_id: last.msg_id, llm_payload: payload,
  };
  let out: LlmOutput & { model: string };
  try { out = await input.llm.classify(payload.system, payload.user); } catch (e) {
    const quota = e instanceof LlmError && e.status === 429;
    throw new GenerateError(quota ? 'llm_quota' : 'llm_error', quota ? 'Gemini quota exhausted (429). Try again later.' : `LLM failed: ${(e as Error).message.slice(0, 120)}`);
  }
  const g = checkDraft(out.draft, { intent: 'OTHER', projectLink: events.JESSELTON.project_link, allowOptOutPhrase: false, attendanceStated: false });
  if (g.ok) res.draft_text = out.draft.trim();
  else { res.original_text = out.draft; res.flags.push(...g.flags.map((f) => `guardrail:${f}`)); res.notes.push('LLM draft rejected by guardrail: write it yourself or regenerate with another request'); }
  return res;
}

/** Guardrail for fixed texts too (Hard constraint 11 applies everywhere). */
export function fixedTextAllowed(code: string): boolean {
  return OPT_OUT_PHRASE_ALLOWED.includes(code);
}
