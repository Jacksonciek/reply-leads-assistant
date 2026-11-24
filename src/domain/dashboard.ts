// "Hari Ini" queue and per-event stats (Section 12.2). Pure.
import type { EventCode } from '../../config/events';
import { FIRST_CASES, REMINDER_CASES, resolveCase } from './cases';
import type { Lead, Message, WaStatus } from './types';

export interface RoomMeta {
  msg_count: number;
  last_dir: 'IN' | 'OUT' | null;
  last_at: string | null;
  /** Short preview of the latest message (sidebar). */
  last_text: string;
  /** First unanswered client message time (oldest first sorting). */
  unanswered_since: string | null;
}

export interface LeadView extends Lead { case: string; due: boolean; sort_key: string; room: RoomMeta; created_today?: boolean }

export function roomMeta(messages: Message[]): RoomMeta {
  const live = messages.filter((m) => !m.deleted).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const last = live[live.length - 1];
  let since: string | null = null;
  for (let i = live.length - 1; i >= 0 && live[i].direction === 'IN'; i--) since = live[i].sent_at;
  return { msg_count: live.length, last_dir: last?.direction ?? null, last_at: last?.sent_at ?? null, last_text: (last?.text ?? '').replace(/\s+/g, ' ').slice(0, 90), unanswered_since: since };
}

export interface QueueItem { lead_id: string; reason: string; label?: string; attention?: boolean }
export interface Dashboard {
  unanswered: QueueItem[];
  first_messages: QueueItem[];
  reminders: QueueItem[];
  pa: QueueItem[];
  name_review: QueueItem[];
  stats: Record<EventCode, Stats>;
}
export interface Stats {
  total: number; new: number; reminder: number; done: number; reminder_due: number; reminder_sent: number;
  do_not_contact: number; needs_pa: number; no_whatsapp: number; s1: number; s2: number;
  /** Leads per WhatsApp status (only statuses that were set). */
  wa: Partial<Record<WaStatus, number>>;
}

const excluded = (l: Lead) => l.no_whatsapp || l.opt_out || l.state === 'DONE';

/** Leads in list order (see sortKey). */
export function sortLeads<T extends Pick<LeadView, 'sort_key'>>(leads: T[]): T[] {
  return [...leads].sort((a, b) => a.sort_key.localeCompare(b.sort_key));
}

export function buildDashboard(leads: LeadView[], now: Date): Dashboard {
  const d: Dashboard = { unanswered: [], first_messages: [], reminders: [], pa: [], name_review: [], stats: {} as Dashboard['stats'] };
  const active = sortLeads(leads.filter((l) => !excluded(l)));

  const unanswered = active.filter((l) => l.room.last_dir === 'IN');
  unanswered.sort((a, b) => (a.room.unanswered_since ?? '').localeCompare(b.room.unanswered_since ?? ''));
  d.unanswered = unanswered.map((l) => ({
    lead_id: l.lead_id,
    reason: 'Client message not answered',
    attention: l.needs_attention,
    label: l.needs_attention ? 'Needs attention' : undefined,
  }));

  for (const l of active) {
    const c = resolveCase(l, now);
    if (FIRST_CASES.includes(c.code) && !l.phone_invalid) d.first_messages.push({ lead_id: l.lead_id, reason: `First message (${c.code})` });
    if (REMINDER_CASES.includes(c.code) && c.due) d.reminders.push({ lead_id: l.lead_id, reason: `${c.reason} (${c.code})` });
    if (l.needs_pa && !l.pa_forwarded) d.pa.push({ lead_id: l.lead_id, reason: l.pa_preferred_time ? `Needs PA, time: ${l.pa_preferred_time}` : 'Forward to PA' });
    if (l.call_name_needs_review) d.name_review.push({ lead_id: l.lead_id, reason: `Check greeting name "${l.call_name}"` });
  }

  for (const ev of ['ROADSHOW', 'JESSELTON'] as EventCode[]) {
    const ls = leads.filter((l) => l.event === ev);
    const rem = ls.filter((l) => l.state === 'REMINDER' && !l.opt_out && !l.no_whatsapp);
    const going = ls.filter((l) => l.state !== 'NEW' && !l.opt_out && !l.no_whatsapp);
    d.stats[ev] = {
      total: ls.length,
      new: ls.filter((l) => l.state === 'NEW').length,
      reminder: ls.filter((l) => l.state === 'REMINDER').length,
      done: ls.filter((l) => l.state === 'DONE').length,
      reminder_due: rem.filter((l) => resolveCase(l, now).due).length,
      reminder_sent: rem.filter((l) => !resolveCase(l, now).due).length,
      do_not_contact: ls.filter((l) => l.opt_out).length,
      needs_pa: ls.filter((l) => l.needs_pa && !l.pa_forwarded).length,
      no_whatsapp: ls.filter((l) => l.no_whatsapp).length,
      s1: going.filter((l) => l.session === 'S1').length,
      s2: going.filter((l) => l.session === 'S2').length,
      wa: ls.reduce((m, l) => (l.wa_status ? { ...m, [l.wa_status]: (m[l.wa_status] ?? 0) + 1 } : m), {} as Stats['wa']),
    };
  }
  return d;
}
