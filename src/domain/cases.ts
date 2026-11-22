// Which message a lead needs next, and whether it needs action now. Pure.
//
// States: NEW (not contacted) -> first message; REMINDER -> reminder rounds; DONE (attended) -> nothing.
// Reminder rounds (WIB dates): everyone gets one on REMINDER_START (the day the Roadshow starts), then one the day
// before their own visit (Roadshow) or the day before the preview (Jesselton). A round is "due" until a reminder
// template is marked sent on or after that round's date.
import { EVENTS } from '../../config/events';
import { addDays, wib } from './time';
import { guestsKnown, type Lead } from './types';

export type CaseCode =
  | 'X' | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B-R' | 'B-H1'
  | 'WAIT' | 'DONE';

export interface CaseResult {
  code: CaseCode;
  /** Template code to render (null = nothing to send). */
  template: string | null;
  variant?: 'empty' | '3plus';
  /** True when this message still has to be sent today (drives sorting and the work queue). */
  due: boolean;
  reason: string;
}

/** First reminder round for every lead already in the reminder stage. */
export const REMINDER_START = EVENTS.ROADSHOW.start_date;

/** Templates whose sending counts as a reminder (sets last_reminder_at). */
export const REMINDER_TEMPLATES = ['A3', 'A4', 'A-R1', 'A-R2', 'B6', 'B-R', 'B-H1'];
export const REMINDER_CASES: CaseCode[] = ['A3', 'A4', 'B6', 'B-R', 'B-H1'];
export const FIRST_CASES: CaseCode[] = ['A1', 'A2', 'B1', 'B2', 'B3', 'B4', 'B5'];
export const PROACTIVE_CASES: CaseCode[] = [...FIRST_CASES, ...REMINDER_CASES];

const res = (code: CaseCode, reason: string, template: string | null = null, due = false, variant?: CaseResult['variant']): CaseResult =>
  ({ code, template, variant, due, reason });

const hasSession = (l: Lead) => l.session === 'S1' || l.session === 'S2';

/** Round dates for a lead in the reminder stage, and the last day reminders make sense. */
export function reminderRounds(lead: Lead): { rounds: string[]; until: string } {
  if (lead.event === 'ROADSHOW') {
    if (lead.visit_date) return { rounds: [REMINDER_START, addDays(lead.visit_date, -1)], until: lead.visit_date };
    return { rounds: [REMINDER_START], until: EVENTS.ROADSHOW.end_date };
  }
  const day = EVENTS.JESSELTON.start_date;
  return { rounds: [REMINDER_START, addDays(day, -1)], until: day };
}

/** The round that currently applies and whether it still needs sending. */
export function reminderDue(lead: Lead, now: Date): boolean {
  const today = wib(now).date;
  const { rounds, until } = reminderRounds(lead);
  if (today > until) return false;
  const current = rounds.filter((r) => r <= today).sort().pop();
  if (!current) return false;
  if (!lead.last_reminder_at) return true;
  return wib(new Date(lead.last_reminder_at)).date < current;
}

function firstMessage(lead: Lead): CaseResult {
  if (lead.event === 'ROADSHOW') {
    return lead.visit_date ? res('A1', 'First message, date known', 'A1', true) : res('A2', 'First message, date not decided', 'A2', true);
  }
  const known = guestsKnown(lead);
  if (hasSession(lead)) {
    if (lead.guests != null && lead.guests > 0) return res('B1', 'First message, session and guests known', 'B1', true);
    if (lead.guests_bucket === '3+') return res('B2', 'First message, session known, 3+ guests', 'B2', true, '3plus');
    return res('B2', 'First message, session known, guests empty', 'B2', true, 'empty');
  }
  if (lead.info_only) return known ? res('B5', 'First message, info only, guests known', 'B5', true) : res('B4', 'First message, info only', 'B4', true);
  if (known) return res('B3', 'First message, guests known, session not', 'B3', true);
  return res('B4', 'First message, session and guests unknown', 'B4', true);
}

function reminder(lead: Lead, now: Date): CaseResult {
  const today = wib(now).date;
  const due = reminderDue(lead, now);
  if (lead.event === 'ROADSHOW') {
    if (today > EVENTS.ROADSHOW.end_date) return res('WAIT', 'Roadshow is over');
    if (lead.visit_date && lead.visit_date >= today) {
      const when = lead.visit_date === today ? 'visit today' : lead.visit_date === addDays(today, 1) ? 'visit tomorrow (H-1)' : `visit ${lead.visit_date}`;
      return res('A4', `Reminder, ${when}`, 'A4', due);
    }
    // No date yet, or the chosen date passed without the client coming: ask which day.
    return res('A3', lead.visit_date ? 'Visit date passed, ask for a new day' : 'Reminder, day not decided', 'A3', due);
  }
  if (today > EVENTS.JESSELTON.start_date) return res('WAIT', 'Preview is over');
  if (hasSession(lead)) {
    return today >= addDays(EVENTS.JESSELTON.start_date, -1)
      ? res('B-H1', 'Reminder, preview tomorrow (H-1)', 'B-H1', due)
      : res('B6', 'Reminder with own session', 'B6', due);
  }
  return res('B-R', 'Reminder, session not known', 'B-R', due);
}

export function resolveCase(lead: Lead, now: Date): CaseResult {
  if (lead.state === 'DONE') return res('DONE', 'Attended');
  if (lead.no_whatsapp) return res('X', 'No WhatsApp');
  if (lead.opt_out) return res('X', 'Do not contact');
  if (lead.phone_invalid) return res('X', 'Invalid number');
  if (lead.state === 'NEW') return firstMessage(lead);
  return reminder(lead, now);
}

/**
 * List order: Roadshow before Jesselton; inside each, leads needing action first (message due or client waiting),
 * then the rest; Roadshow by visit day (today, then tomorrow/H-1, later days, undecided); Jesselton by known session.
 */
export function sortKey(lead: Lead, c: CaseResult, now: Date, clientWaiting = false): string {
  const today = wib(now).date;
  const ev = lead.event === 'ROADSHOW' ? '0' : '1';
  const bucket = c.code === 'X' || c.code === 'DONE' ? '3' : c.due || clientWaiting ? '0' : c.code === 'WAIT' ? '2' : '1';
  let rank: string;
  if (lead.event === 'ROADSHOW') {
    const v = lead.visit_date;
    rank = !v ? '4' : v === today ? '0' : v === addDays(today, 1) ? '1' : v > today ? `2${v}` : '3';
  } else {
    rank = hasSession(lead) ? `0${lead.session}` : '1';
  }
  return `${ev}${bucket}${rank.padEnd(12, ' ')}${(lead.full_name || '').toLowerCase()}`;
}
