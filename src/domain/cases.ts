import { EVENTS } from '../../config/events';
import { hoursBetween, wib, addDays } from './time';
import { guestsKnown, type Lead } from './types';

export type CaseCode =
  | 'X' | 'A1' | 'A2' | 'A-R1' | 'A-R2' | 'A-H1'
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B-R' | 'B-H1'
  | 'CONV' | 'WAIT' | 'DONE';

export interface CaseResult {
  code: CaseCode;
  /** Template code to render (null = no proactive action). */
  template: string | null;
  variant?: 'empty' | '3plus';
  reason: string;
}

const MAX_REMINDERS = 2;
const REMINDER_GAP_HOURS = 24;

const res = (code: CaseCode, reason: string, template: string | null = null, variant?: CaseResult['variant']): CaseResult =>
  ({ code, template, variant, reason });

/** True when a reminder is due (24h gap, max 2, before the event / visit date passes). */
export function reminderDue(lead: Lead, now: Date): boolean {
  if (lead.state !== 'AWAITING_REPLY' || lead.reminder_count >= MAX_REMINDERS) return false;
  const today = wib(now).date;
  const ev = EVENTS[lead.event];
  if (today > ev.end_date) return false;
  if (lead.event === 'ROADSHOW' && lead.visit_date && today > lead.visit_date) return false;
  const lastOut = lead.last_outbound_at ?? lead.first_sent_at;
  if (!lastOut) return true; // imported "Belum balas" without timestamps: due immediately
  if (lead.last_inbound_at && lead.last_inbound_at > lastOut) return false;
  return hoursBetween(lastOut, now) >= REMINDER_GAP_HOURS;
}

function h1Due(lead: Lead, now: Date): boolean {
  if (lead.state !== 'CONFIRMED') return false;
  const p = wib(now);
  if (lead.event === 'ROADSHOW') {
    if (!lead.visit_date || lead.last_template === 'A-H1') return false;
    return addDays(p.date, 1) === lead.visit_date;
  }
  if (lead.last_template === 'B-H1') return false;
  return p.date === addDays(EVENTS.JESSELTON.start_date, -1) && p.hour >= 8;
}

export function resolveCase(lead: Lead, now: Date): CaseResult {
  if (lead.state === 'NO_WHATSAPP') return res('X', 'Tidak ada WhatsApp');
  if (lead.opt_out || lead.state === 'OPTED_OUT') return res('X', 'Opt-out');
  if (lead.state === 'DECLINED') return res('X', 'Menolak');
  if (lead.phone_invalid) return res('X', 'Nomor tidak valid');

  if (lead.event === 'ROADSHOW') {
    switch (lead.state) {
      case 'NEW':
        return lead.visit_date ? res('A1', 'Belum dihubungi, tanggal ada', 'A1') : res('A2', 'Belum dihubungi, tanggal belum pasti', 'A2');
      case 'AWAITING_REPLY':
        if (reminderDue(lead, now)) return lead.visit_date ? res('A-R1', 'Reminder jatuh tempo', 'A-R1') : res('A-R2', 'Reminder jatuh tempo', 'A-R2');
        return res('WAIT', 'Menunggu balasan');
      case 'REPLIED':
        return res('CONV', 'Klien sudah membalas');
      case 'CONFIRMED':
        return h1Due(lead, now) ? res('A-H1', 'Pengingat H-1', 'A-H1') : res('DONE', 'Terkonfirmasi');
    }
  }

  // JESSELTON
  switch (lead.state) {
    case 'NEW': {
      const hasSession = lead.session === 'S1' || lead.session === 'S2';
      const known = guestsKnown(lead);
      if (hasSession) {
        if (lead.guests != null && lead.guests > 0) return res('B1', 'Sesi + jumlah tamu ada', 'B1');
        if (lead.guests_bucket === '3+') return res('B2', 'Sesi ada, tamu 3+', 'B2', '3plus');
        return res('B2', 'Sesi ada, tamu kosong', 'B2', 'empty');
      }
      if (lead.info_only) return known ? res('B5', 'Info saja, tamu ada', 'B5') : res('B4', 'Info saja', 'B4');
      if (known) return res('B3', 'Tamu ada, sesi belum', 'B3');
      return res('B4', 'Sesi dan tamu belum ada', 'B4');
    }
    case 'AWAITING_REPLY':
      return reminderDue(lead, now) ? res('B-R', 'Reminder jatuh tempo', 'B-R') : res('WAIT', 'Menunggu balasan');
    case 'REPLIED':
      return res('CONV', 'Klien sudah membalas');
    case 'CONFIRMED':
      return h1Due(lead, now) ? res('B-H1', 'Pengingat H-1', 'B-H1') : res('DONE', 'Terkonfirmasi');
  }
  return res('X', 'State tidak dikenal');
}

export const PROACTIVE_CASES: CaseCode[] = ['A1', 'A2', 'A-R1', 'A-R2', 'A-H1', 'B1', 'B2', 'B3', 'B4', 'B5', 'B-R', 'B-H1'];
export const REMINDER_CASES: CaseCode[] = ['A-R1', 'A-R2', 'B-R'];
export const H1_CASES: CaseCode[] = ['A-H1', 'B-H1'];
