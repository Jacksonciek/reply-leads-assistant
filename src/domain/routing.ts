// Intent -> draft source + suggested action. Decided by code, never by the LLM (Section 11.3).
import { guestsKnown, type Lead, type LeadState } from './types';

export const INTENTS = [
  'CONFIRM_ATTEND', 'PROVIDE_DETAILS', 'CHANGE_SCHEDULE', 'DECLINE', 'OPT_OUT', 'ASK_EVENT_INFO', 'REQUEST_INFO',
  'FORGOT_REGISTRATION', 'ASK_PRODUCT', 'REQUEST_CALL', 'PA_TIME_GIVEN', 'SOURCE_QUESTION', 'SUSPICIOUS',
  'COMPLAINT', 'ASK_IF_BOT', 'SMALL_TALK', 'OTHER',
] as const;
export type Intent = (typeof INTENTS)[number];
/** Intents produced by the deterministic pre-check only. */
export type AnyIntent = Intent | 'SOFT_ACK' | 'MEDIA';

export const INTENT_LABEL: Record<AnyIntent, string> = {
  CONFIRM_ATTEND: 'Konfirmasi hadir',
  PROVIDE_DETAILS: 'Memberi data kehadiran',
  CHANGE_SCHEDULE: 'Ubah jadwal',
  DECLINE: 'Tidak bisa hadir',
  OPT_OUT: 'Minta berhenti dihubungi',
  ASK_EVENT_INFO: 'Tanya info acara',
  REQUEST_INFO: 'Minta dikirimi info',
  FORGOT_REGISTRATION: 'Lupa pendaftaran',
  ASK_PRODUCT: 'Tanya produk (harga/unit)',
  REQUEST_CALL: 'Minta ditelepon',
  PA_TIME_GIVEN: 'Menyebut waktu untuk PA',
  SOURCE_QUESTION: 'Tanya asal nomor',
  SUSPICIOUS: 'Curiga / ragu',
  COMPLAINT: 'Keluhan',
  ASK_IF_BOT: 'Tanya apakah bot',
  SMALL_TALK: 'Basa-basi',
  OTHER: 'Lainnya',
  SOFT_ACK: 'Balasan pendek (belum pasti hadir)',
  MEDIA: 'Klien mengirim media',
};

export interface Extracted {
  visit_date: string | null;
  arrival_time: string | null;
  session: 'S1' | 'S2' | null;
  guests: number | null;
  pa_preferred_time: string | null;
}

export interface Classification {
  intent: Intent;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  answer_in_kb: boolean;
  extracted: Extracted;
}

export type DraftPlan =
  | { kind: 'NONE'; note: string }
  | { kind: 'FIXED'; code: string }
  | { kind: 'TEMPLATE'; code: string; attachPoster?: boolean }
  | { kind: 'LLM' };

/** Changes applied only when Jackson clicks "Terapkan" (or KONF is marked sent). */
export interface Suggestion {
  state?: LeadState;
  opt_out?: boolean;
  needs_pa?: boolean;
  pa_preferred_time?: string;
  needs_attention?: boolean;
  visit_date?: string;
  arrival_time?: string;
  session?: 'S1' | 'S2';
  guests?: number;
}

export interface Routing {
  draft: DraftPlan;
  suggestion: Suggestion;
  needsAttention: boolean;
  notes: string[];
}

export const CONFIDENCE_MIN = 0.75;

/** Lead merged with extracted fields (proposal only, not yet written). */
export function mergeExtracted(lead: Lead, ex: Partial<Extracted> | null | undefined): Lead {
  const m = { ...lead };
  if (!ex) return m;
  if (ex.visit_date) { m.visit_date = ex.visit_date; }
  if (ex.arrival_time) m.arrival_time = ex.arrival_time;
  if (ex.session) { m.session = ex.session; m.info_only = false; }
  if (ex.guests != null && ex.guests > 0) { m.guests = ex.guests; m.guests_bucket = ''; }
  return m;
}

export function konfComplete(lead: Lead): boolean {
  if (lead.event === 'ROADSHOW') return !!lead.visit_date;
  return (lead.session === 'S1' || lead.session === 'S2') && lead.guests != null && lead.guests > 0;
}

function extractedSuggestion(ex: Extracted): Suggestion {
  const s: Suggestion = {};
  if (ex.visit_date) s.visit_date = ex.visit_date;
  if (ex.arrival_time) s.arrival_time = ex.arrival_time;
  if (ex.session) s.session = ex.session;
  if (ex.guests != null && ex.guests > 0) s.guests = ex.guests;
  return s;
}

export function routeIntent(c: Classification, lead: Lead): Routing {
  const r = (x: Partial<Routing> & Pick<Routing, 'draft'>): Routing => ({ suggestion: {}, needsAttention: false, notes: [], ...x });
  const attention = (draft: DraftPlan = { kind: 'LLM' }) => r({ draft, needsAttention: true, suggestion: { needs_attention: true } });

  switch (c.intent) {
    case 'OPT_OUT':
      return r({ draft: { kind: 'FIXED', code: 'OPT_OUT' }, suggestion: { opt_out: true } });
    case 'SOURCE_QUESTION':
      return attention({ kind: 'FIXED', code: 'SOURCE' });
    case 'ASK_IF_BOT':
    case 'SUSPICIOUS':
    case 'COMPLAINT':
      return attention();
    case 'SMALL_TALK':
      return r({ draft: { kind: 'NONE', note: 'No reply needed' } });
  }
  if (c.sentiment === 'negative' && c.intent !== 'DECLINE') return attention();

  switch (c.intent) {
    case 'CONFIRM_ATTEND':
    case 'PROVIDE_DETAILS':
    case 'CHANGE_SCHEDULE': {
      const merged = mergeExtracted(lead, c.extracted);
      const sug = extractedSuggestion(c.extracted);
      if (konfComplete(merged) && c.confidence >= CONFIDENCE_MIN) {
        return r({ draft: { kind: 'TEMPLATE', code: lead.event === 'ROADSHOW' ? 'KONF-A' : 'KONF-B' }, suggestion: sug, notes: ['Setelah KONF ditandai terkirim, konfirmasi dicatat (status tetap Reminder sampai klien hadir)'] });
      }
      return r({ draft: { kind: 'LLM' }, suggestion: sug, notes: ['Details incomplete or uncertain: the draft asks for what is missing'] });
    }
    case 'DECLINE':
      return r({ draft: { kind: 'FIXED', code: 'DECLINE' }, suggestion: { opt_out: true } });
    case 'ASK_PRODUCT':
      return r({ draft: { kind: 'FIXED', code: 'HANDOFF_PA' }, suggestion: { needs_pa: true } });
    case 'REQUEST_CALL':
      return r({ draft: { kind: 'FIXED', code: 'CALL_REQUEST' }, suggestion: { needs_pa: true } });
    case 'PA_TIME_GIVEN':
      return r({ draft: { kind: 'FIXED', code: 'PA_TIME_ACK' }, suggestion: { needs_pa: true, pa_preferred_time: c.extracted.pa_preferred_time ?? '' } });
    case 'ASK_EVENT_INFO':
      return c.answer_in_kb
        ? r({ draft: { kind: 'LLM' } })
        : r({ draft: { kind: 'FIXED', code: 'HOLD' }, notes: ['Answer not in Knowledge (FAQ) yet'] });
    case 'REQUEST_INFO':
    case 'FORGOT_REGISTRATION':
      if (lead.event === 'ROADSHOW') return r({ draft: { kind: 'LLM' }, notes: ['Attach the e-invite (poster) when sending'] });
      return r({ draft: { kind: 'LLM' }, notes: [guestsKnown(lead) ? 'Draft follows pattern B5' : 'Draft follows pattern B4'] });
    default:
      return r({ draft: { kind: 'LLM' } });
  }
}
