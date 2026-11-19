import { EVENTS, type EventCode } from '../../config/events';
import { deriveCallName, normalizeGender } from './names';
import { normalizePhone } from './phone';
import { dateLabel, MONTH_NAMES } from './time';
import { emptyLead, type GuestsBucket, type Lead, type LeadSource, type LeadState, type Session } from './types';

export interface ParsedRow { lead: Lead; warnings: string[] }

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** "Senin, 23 November 2026" -> 2026-11-23. "Belum pasti" -> null. */
export function parseRoadshowDate(raw: unknown): { date: string | null; warning?: string } {
  const s = clean(raw);
  if (!s || /belum\s*pasti|tbc|^-$|^\?$/i.test(s)) return { date: null };
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return { date: null, warning: `Unrecognised date: "${s}"` };
  const mi = MONTH_NAMES.findIndex((n) => n.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
  if (mi < 0) return { date: null, warning: `Bulan tidak dikenali: "${s}"` };
  const date = `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return { date, warning: roadshowDateWarning(date) };
}

export function roadshowDateWarning(date: string | null): string | undefined {
  if (!date) return undefined;
  const ev = EVENTS.ROADSHOW;
  if (date < ev.start_date || date > ev.end_date) return `Tanggal ${dateLabel(date)} di luar rentang acara 23–29 November 2026`;
  return undefined;
}

export function parseSession(raw: unknown): { session: Session; info_only: boolean } {
  const s = clean(raw).toLowerCase();
  const info_only = /kirim info/.test(s);
  if (/^11[:.]00\s*[-–]\s*13[:.]00/.test(s) || s === 's1' || s === '1') return { session: 'S1', info_only };
  if (/^15[:.]00\s*[-–]\s*17[:.]00/.test(s) || s === 's2' || s === '2') return { session: 'S2', info_only };
  if (/belum\s*pasti|undecided/.test(s)) return { session: 'UNDECIDED', info_only };
  return { session: 'NONE', info_only };
}

export function parseGuests(raw: unknown): { guests: number | null; guests_bucket: GuestsBucket; info_only: boolean } {
  const s = clean(raw).toLowerCase();
  if (/kirim info/.test(s)) return { guests: null, guests_bucket: 'unknown', info_only: true };
  if (/3\s*orang\s*atau\s*lebih|3\+|lebih/.test(s)) return { guests: null, guests_bucket: '3+', info_only: false };
  const n = s.match(/^(\d+)/);
  if (n && Number(n[1]) > 0) return { guests: Number(n[1]), guests_bucket: '', info_only: false };
  return { guests: null, guests_bucket: 'unknown', info_only: false };
}

export function mapExcelStatus(raw: unknown): LeadState {
  const s = clean(raw).toLowerCase();
  if (s === 'belum balas') return 'AWAITING_REPLY';
  if (s === 'sudah balas') return 'REPLIED';
  if (s === 'no whatsapp') return 'NO_WHATSAPP';
  if (s === 'terkonfirmasi') return 'CONFIRMED';
  if (s === 'tidak hadir') return 'DECLINED';
  if (s === 'opt-out' || s === 'opt out') return 'OPTED_OUT';
  return 'NEW';
}


function base(event: EventCode, row: Record<string, unknown>, _rowRef: string): { lead: Lead; warnings: string[] } {
  const warnings: string[] = [];
  const full_name = clean(row['Name']);
  const cn = deriveCallName(full_name);
  const ph = normalizePhone(String(row['Phone number'] ?? ''));
  if (ph.invalid) warnings.push('Invalid WhatsApp number');
  if (cn.needsReview) warnings.push('Greeting name needs checking');
  const gender = normalizeGender(row['Gender']);
  if (!gender) warnings.push('Gender empty, greeting uses "Bapak/Ibu"');
  const lead = emptyLead({
    event, full_name, call_name: cn.callName, call_name_needs_review: cn.needsReview, agent_name: cn.agentName,
    gender, phone_e164: ph.phone, phone_invalid: ph.invalid, email: clean(row['Email']),
    state: mapExcelStatus(row['Status']), bitrix_status: clean(row['Status in Bitrix']),
  });
  return { lead, warnings };
}

export function parseRoadshowRow(row: Record<string, unknown>, rowRef = ''): ParsedRow {
  const { lead, warnings } = base('ROADSHOW', row, rowRef);
  lead.source = 'Agent';
  const d = parseRoadshowDate(row['Date']);
  if (d.warning) warnings.push(d.warning);
  lead.visit_date = d.date;
  lead.visit_date_label = d.date ? dateLabel(d.date) : '';
  return { lead, warnings };
}

export function parseSource(raw: unknown): LeadSource {
  const s = clean(raw).toLowerCase();
  if (/web/.test(s)) return 'Website';
  if (/meta|fb|facebook|ig|instagram/.test(s)) return 'Meta';
  if (/agen|agent/.test(s)) return 'Agent';
  return '';
}

export function parseJesseltonRow(row: Record<string, unknown>, rowRef = ''): ParsedRow {
  const { lead, warnings } = base('JESSELTON', row, rowRef);
  lead.source = parseSource(row['Website / Meta']);
  const ses = parseSession(row['Time']);
  const g = parseGuests(row['Guest']);
  lead.session = ses.session;
  lead.info_only = ses.info_only || g.info_only;
  lead.guests = g.guests;
  lead.guests_bucket = g.guests_bucket;
  return { lead, warnings };
}

/** Rows whose Name is empty are trailing numbered blanks: skip. */
export function isDataRow(row: Record<string, unknown>): boolean {
  return clean(row['Name']) !== '';
}

export function parseSheetRows(sheet: 'Roadshow' | 'Jesselton', rows: Record<string, unknown>[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  rows.forEach((r, i) => {
    if (!isDataRow(r)) return;
    const ref = `${sheet}!${i + 2}`;
    out.push(sheet === 'Roadshow' ? parseRoadshowRow(r, ref) : parseJesseltonRow(r, ref));
  });
  return out;
}
