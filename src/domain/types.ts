import type { EventCode } from '../../config/events';

/** NEW = not contacted yet, REMINDER = in the reminder stage, DONE = attended (finished). */
export type LeadState = 'NEW' | 'REMINDER' | 'DONE';
export type Gender = 'Bapak' | 'Ibu' | '';
export type LeadSource = 'Agent' | 'Meta' | 'Website' | '';
export type Session = 'S1' | 'S2' | 'UNDECIDED' | 'NONE';
export type GuestsBucket = '' | '3+' | 'unknown';

/** Where the WhatsApp conversation stands (set from reading the chat). '' = not checked yet. */
export type WaStatus = '' | 'NO_REPLY' | 'NO_WA' | 'CONFIRMED' | 'UNSURE' | 'CANNOT_ATTEND' | 'BAD_LEAD';
export const WA_STATUS_LABEL: Record<Exclude<WaStatus, ''>, string> = {
  NO_REPLY: 'Belum balas',
  NO_WA: 'No WhatsApp',
  CONFIRMED: 'Terkonfirmasi',
  UNSURE: 'Balas, belum pasti',
  CANNOT_ATTEND: 'Tidak bisa hadir',
  BAD_LEAD: 'Bad lead',
};

export interface Lead {
  lead_id: string;
  /** "No" column: row order of the Excel file (0 = not set). */
  no: number;
  event: EventCode;
  full_name: string;
  call_name: string;
  call_name_needs_review: boolean;
  gender: Gender;
  phone_e164: string;
  phone_invalid: boolean;
  email: string;
  source: LeadSource;
  agent_name: string;
  visit_date: string | null; // YYYY-MM-DD
  visit_date_label: string;
  arrival_time: string; // HH:MM or ''
  session: Session;
  info_only: boolean;
  guests: number | null;
  guests_bucket: GuestsBucket;
  state: LeadState;
  bitrix_status: string;
  case_code: string;
  first_sent_at: string | null; // ISO UTC
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  reminder_count: number;
  /** When the last reminder template was marked sent (drives the reminder rounds). */
  last_reminder_at: string | null;
  last_template: string;
  confirmed_at: string | null;
  needs_pa: boolean;
  pa_preferred_time: string;
  pa_forwarded: boolean;
  /** Do not contact (opt-out or declined). */
  opt_out: boolean;
  /** Number is not on WhatsApp. */
  no_whatsapp: boolean;
  needs_attention: boolean;
  notes: string;
  wa_status: WaStatus;
  /** What to do next with this lead (short). */
  next_step: string;
  /** Suggested reminder text. Never sent by the app. */
  reminder_text: string;
  created_at: string;
  updated_at: string;
}

export type Direction = 'IN' | 'OUT';
export type MessageSource = 'PASTED' | 'TEMPLATE' | 'LLM_DRAFT' | 'EDITED_DRAFT' | 'MANUAL' | 'WHATSAPP';

export interface Message {
  msg_id: string;
  lead_id: string;
  direction: Direction;
  source: MessageSource;
  text: string;
  template_code: string;
  sent_at: string; // ISO UTC
  created_at: string;
  deleted: boolean;
}
export const MESSAGE_COLUMNS = ['msg_id', 'lead_id', 'direction', 'source', 'text', 'template_code', 'sent_at', 'created_at', 'deleted'];

export type DraftState = 'PENDING' | 'USED' | 'DISCARDED';
export interface Draft {
  draft_id: string;
  lead_id: string;
  after_msg_id: string;
  intent: string;
  confidence: string;
  extracted_json: string;
  flags: string; // comma separated
  draft_text: string;
  draft_source: 'TEMPLATE' | 'LLM' | 'FIXED' | 'NONE';
  template_code: string;
  original_text: string; // LLM draft rejected by guardrail (shown with a warning)
  reason: string;
  suggestion_json: string;
  instruction: string;
  state: DraftState;
  created_at: string;
}
export const DRAFT_COLUMNS = [
  'draft_id', 'lead_id', 'after_msg_id', 'intent', 'confidence', 'extracted_json', 'flags', 'draft_text',
  'draft_source', 'template_code', 'original_text', 'reason', 'suggestion_json', 'instruction', 'state', 'created_at',
];

export const FAQ_COLUMNS = ['faq_id', 'event', 'question', 'answer', 'approved', 'updated_at'];
export const TEMPLATE_COLUMNS = ['code', 'event', 'body', 'status', 'updated_at'];
export const CONFIG_COLUMNS = ['key', 'value'];

export interface Faq { faq_id: string; event: EventCode | 'ALL'; question: string; answer: string; approved: boolean; updated_at: string }

export function emptyLead(partial: Partial<Lead> = {}): Lead {
  return {
    lead_id: '', no: 0, event: 'ROADSHOW', full_name: '', call_name: '', call_name_needs_review: false, gender: '',
    phone_e164: '', phone_invalid: false, email: '', source: '', agent_name: '', visit_date: null,
    visit_date_label: '', arrival_time: '', session: 'NONE', info_only: false, guests: null, guests_bucket: 'unknown',
    state: 'NEW', bitrix_status: '', case_code: '', first_sent_at: null, last_outbound_at: null,
    last_inbound_at: null, reminder_count: 0, last_reminder_at: null, last_template: '', confirmed_at: null, needs_pa: false,
    pa_preferred_time: '', pa_forwarded: false, opt_out: false, no_whatsapp: false, needs_attention: false, notes: '', wa_status: '', next_step: '', reminder_text: '', created_at: '',
    updated_at: '', ...partial,
  };
}

/** Human label for guests. */
export function guestsLabel(lead: Pick<Lead, 'guests' | 'guests_bucket'>): string | undefined {
  if (lead.guests != null && lead.guests > 0) return `${lead.guests} orang`;
  if (lead.guests_bucket === '3+') return '3 orang atau lebih';
  return undefined;
}

export function guestsKnown(lead: Pick<Lead, 'guests' | 'guests_bucket'>): boolean {
  return (lead.guests != null && lead.guests > 0) || lead.guests_bucket === '3+';
}

export const STATE_LABEL: Record<LeadState, string> = {
  NEW: 'New',
  REMINDER: 'Reminder',
  DONE: 'Done',
};
export const STATUS_OPTIONS = Object.values(STATE_LABEL);
