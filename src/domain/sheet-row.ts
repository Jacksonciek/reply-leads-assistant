// Lead <-> Google Sheets row, using the same visible layout as the Excel file (Section 6.4).
// Visible columns are the source of truth (Jackson edits them by hand); system columns hold timestamps/flags.
import { EVENTS, sessionInfo, type EventCode } from '../../config/events';
import { deriveCallName, normalizeGender } from './names';
import { legacyStatusFlags, parseGuests, parseRoadshowDate, parseSession, parseSource } from './parse-excel-row';
import { normalizePhone } from './phone';
import { dateLabel } from './time';
import { emptyLead, STATE_LABEL, type Lead } from './types';

export const VISIBLE_COLUMNS: Record<EventCode, string[]> = {
  ROADSHOW: ['No', 'Name', 'Gender', 'Phone number', 'Email', 'Date', 'Status', 'Status in Bitrix', 'Nama Sapaan', 'Jam Datang', 'Catatan'],
  JESSELTON: ['No', 'Name', 'Gender', 'Phone number', 'Website / Meta', 'Time', 'Guest', 'Status', 'Status in Bitrix', 'Nama Sapaan', 'Jumlah Pasti', 'Catatan'],
};

export const SYSTEM_COLUMNS = [
  'lead_id', 'phone_e164', 'state', 'case_code', 'first_sent_at', 'last_outbound_at', 'last_inbound_at',
  'reminder_count', 'last_template', 'confirmed_at', 'needs_pa', 'pa_preferred_time', 'pa_forwarded', 'opt_out',
  'needs_attention', 'last_reminder_at', 'no_whatsapp', 'call_name_ok', 'agent_name', 'created_at', 'updated_at',
];

export const leadColumns = (ev: EventCode) => [...VISIBLE_COLUMNS[ev], ...SYSTEM_COLUMNS];

export const DATE_OPTIONS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'].map(dateLabel);
export const TIME_OPTIONS = ['11:00-13:00', '15:00-17:00', 'Belum pasti, Kirim info saja', 'None'];
export const GUEST_OPTIONS = ['1 orang', '2 orang', '3 orang atau lebih', 'Kirim info saja', 'Unknown'];

export type RowObj = Record<string, string>;

const bool = (v: string | undefined) => /^(true|1|ya|yes)$/i.test((v ?? '').trim());
const str = (v: string | undefined) => (v ?? '').toString();
const nullable = (v: string | undefined) => (str(v).trim() === '' ? null : str(v).trim());

/**
 * Status column of a lead row. Only New / Reminder / Done exist; any older label ("Belum chat", "Belum balas",
 * "Sudah balas", "Terkonfirmasi", "No WhatsApp", ...) belongs to data entered before the switch and moves to Reminder.
 */
export function sheetStatus(raw: string | undefined): Lead['state'] {
  const s = str(raw).trim().toLowerCase();
  if (s === 'new' || s === '') return 'NEW';
  if (s === 'done') return 'DONE';
  return 'REMINDER';
}

/** Parse a sheet row. `fixes` lists system values that should be written back (missing id, call name...). */
export function rowToLead(ev: EventCode, r: RowObj): Lead {
  const full_name = str(r['Name']).replace(/\s+/g, ' ').trim();
  const cn = deriveCallName(full_name);
  const ph = normalizePhone(str(r['Phone number']));
  const manualCall = str(r['Nama Sapaan']).trim();
  const lead = emptyLead({
    lead_id: str(r['lead_id']).trim(),
    event: ev,
    full_name,
    call_name: manualCall || cn.callName,
    call_name_needs_review: !bool(r['call_name_ok']) && (manualCall ? manualCall === cn.callName && cn.needsReview : cn.needsReview),
    agent_name: str(r['agent_name']).trim() || cn.agentName,
    gender: normalizeGender(r['Gender']),
    phone_e164: ph.phone,
    phone_invalid: ph.invalid,
    state: sheetStatus(r['Status']),
    bitrix_status: str(r['Status in Bitrix']).trim(),
    case_code: str(r['case_code']),
    first_sent_at: nullable(r['first_sent_at']),
    last_outbound_at: nullable(r['last_outbound_at']),
    last_inbound_at: nullable(r['last_inbound_at']),
    reminder_count: Number(str(r['reminder_count']) || 0) || 0,
    last_reminder_at: nullable(r['last_reminder_at']),
    last_template: str(r['last_template']),
    confirmed_at: nullable(r['confirmed_at']),
    needs_pa: bool(r['needs_pa']),
    pa_preferred_time: str(r['pa_preferred_time']),
    pa_forwarded: bool(r['pa_forwarded']),
    opt_out: bool(r['opt_out']),
    no_whatsapp: bool(r['no_whatsapp']),
    needs_attention: bool(r['needs_attention']),
    notes: str(r['Catatan']),
    created_at: str(r['created_at']),
    updated_at: str(r['updated_at']),
  });
  const legacy = legacyStatusFlags(r['Status']);
  if (legacy.opt_out) lead.opt_out = true;
  if (legacy.no_whatsapp) lead.no_whatsapp = true;
  if (ev === 'ROADSHOW') {
    lead.source = 'Agent';
    lead.email = str(r['Email']).trim();
    const d = parseRoadshowDate(r['Date']);
    lead.visit_date = d.date;
    lead.visit_date_label = d.date ? dateLabel(d.date) : '';
    lead.arrival_time = normalizeTime(str(r['Jam Datang']));
  } else {
    lead.source = parseSource(r['Website / Meta']);
    const s = parseSession(r['Time']);
    const g = parseGuests(r['Guest']);
    lead.session = s.session;
    lead.info_only = s.info_only || g.info_only;
    lead.guests = g.guests;
    lead.guests_bucket = g.guests_bucket;
    const exact = Number(str(r['Jumlah Pasti']).replace(/\D/g, ''));
    if (exact > 0) { lead.guests = exact; lead.guests_bucket = ''; }
    lead.visit_date = EVENTS.JESSELTON.start_date;
    lead.visit_date_label = dateLabel(EVENTS.JESSELTON.start_date);
  }
  return lead;
}

export function normalizeTime(s: string): string {
  const m = s.trim().match(/^(\d{1,2})[.:](\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function timeCell(l: Lead): string {
  const s = sessionInfo(l.session);
  if (s) return s.excelValue;
  if (l.session === 'UNDECIDED' || (l.info_only && (l.guests != null || l.guests_bucket === '3+'))) return 'Belum pasti, Kirim info saja';
  return 'None';
}

function guestCell(l: Lead): string {
  if (l.guests === 1 || l.guests === 2) return `${l.guests} orang`;
  if ((l.guests ?? 0) >= 3 || l.guests_bucket === '3+') return '3 orang atau lebih';
  if (l.info_only) return 'Kirim info saja';
  return 'Unknown';
}

const b = (v: boolean) => (v ? 'TRUE' : 'FALSE');

/** Values for the columns this app owns. Unknown columns in the sheet are left untouched by the caller. */
export function leadToRow(l: Lead, no?: number): RowObj {
  const r: RowObj = {
    Name: l.full_name,
    Gender: l.gender,
    'Phone number': l.phone_e164 ? `wa.me/${l.phone_e164}` : '',
    Status: STATE_LABEL[l.state],
    'Status in Bitrix': l.bitrix_status,
    'Nama Sapaan': l.call_name,
    Catatan: l.notes,
    lead_id: l.lead_id,
    phone_e164: l.phone_e164,
    state: l.state,
    case_code: l.case_code,
    first_sent_at: l.first_sent_at ?? '',
    last_outbound_at: l.last_outbound_at ?? '',
    last_inbound_at: l.last_inbound_at ?? '',
    reminder_count: String(l.reminder_count),
    last_reminder_at: l.last_reminder_at ?? '',
    no_whatsapp: b(l.no_whatsapp),
    last_template: l.last_template,
    confirmed_at: l.confirmed_at ?? '',
    needs_pa: b(l.needs_pa),
    pa_preferred_time: l.pa_preferred_time,
    pa_forwarded: b(l.pa_forwarded),
    opt_out: b(l.opt_out),
    needs_attention: b(l.needs_attention),
    call_name_ok: b(!l.call_name_needs_review),
    agent_name: l.agent_name,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
  if (no != null) r['No'] = String(no);
  if (l.event === 'ROADSHOW') {
    r['Email'] = l.email;
    r['Date'] = l.visit_date ? dateLabel(l.visit_date) : 'Belum pasti';
    r['Jam Datang'] = l.arrival_time ? l.arrival_time.replace(':', '.') : '';
  } else {
    r['Website / Meta'] = l.source === 'Website' ? 'Website' : l.source === 'Meta' ? 'Meta' : '';
    r['Time'] = timeCell(l);
    r['Guest'] = guestCell(l);
    r['Jumlah Pasti'] = l.guests != null && l.guests > 0 ? String(l.guests) : '';
  }
  return r;
}

/** A row is a lead when Name or Phone number is filled. */
export function isLeadRow(r: RowObj): boolean {
  return str(r['Name']).trim() !== '' || str(r['Phone number']).trim() !== '';
}
