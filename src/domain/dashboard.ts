// "Hari Ini" queue and per-event stats (Section 12.2). Pure.
import type { EventCode } from '../../config/events';
import { H1_CASES, REMINDER_CASES, resolveCase } from './cases';
import type { Lead, Message } from './types';

export interface RoomMeta {
  msg_count: number;
  last_dir: 'IN' | 'OUT' | null;
  last_at: string | null;
  /** Short preview of the latest message (sidebar). */
  last_text: string;
  /** First unanswered client message time (oldest first sorting). */
  unanswered_since: string | null;
}

export interface LeadView extends Lead { case: string; room: RoomMeta; created_today?: boolean }

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
  h1: QueueItem[];
  pa: QueueItem[];
  name_review: QueueItem[];
  stats: Record<EventCode, Stats>;
}
export interface Stats {
  total: number; contacted: number; replied: number; confirmed: number; declined: number; opted_out: number;
  needs_pa: number; no_whatsapp: number; s1: number; s2: number; guests_confirmed: number;
}

const excluded = (l: Lead) => l.state === 'NO_WHATSAPP' || l.state === 'OPTED_OUT' || l.opt_out;

export function buildDashboard(leads: LeadView[], now: Date): Dashboard {
  const d: Dashboard = { unanswered: [], first_messages: [], reminders: [], h1: [], pa: [], name_review: [], stats: {} as Dashboard['stats'] };
  const active = leads.filter((l) => !excluded(l));

  const unanswered = active.filter((l) => l.room.last_dir === 'IN' || (l.state === 'REPLIED' && l.room.msg_count === 0));
  unanswered.sort((a, b) => (a.room.unanswered_since ?? '').localeCompare(b.room.unanswered_since ?? ''));
  d.unanswered = unanswered.map((l) => ({
    lead_id: l.lead_id,
    reason: l.room.msg_count === 0 ? 'Paste the latest chat' : 'Client message not answered',
    attention: l.needs_attention,
    label: l.needs_attention ? 'Needs attention' : undefined,
  }));

  const first = active.filter((l) => l.state === 'NEW' && !l.phone_invalid);
  const rank = (l: Lead) => (l.event === 'ROADSHOW' ? (l.visit_date ?? '9999') : '2026-11-28') + (l.case_code === 'B1' ? '0' : '1');
  first.sort((a, b) => rank(a).localeCompare(rank(b)));
  d.first_messages = first.map((l) => ({ lead_id: l.lead_id, reason: `First message (${resolveCase(l, now).code})` }));

  for (const l of active) {
    const c = resolveCase(l, now).code;
    if (REMINDER_CASES.includes(c)) d.reminders.push({ lead_id: l.lead_id, reason: `Reminder #${l.reminder_count + 1} (${c})` });
    if (H1_CASES.includes(c)) d.h1.push({ lead_id: l.lead_id, reason: `Day-before reminder (${c})` });
    if (l.needs_pa && !l.pa_forwarded) d.pa.push({ lead_id: l.lead_id, reason: l.pa_preferred_time ? `Needs PA, time: ${l.pa_preferred_time}` : 'Forward to PA' });
    if (l.call_name_needs_review) d.name_review.push({ lead_id: l.lead_id, reason: `Check greeting name "${l.call_name}"` });
  }

  for (const ev of ['ROADSHOW', 'JESSELTON'] as EventCode[]) {
    const ls = leads.filter((l) => l.event === ev);
    const conf = ls.filter((l) => l.state === 'CONFIRMED');
    d.stats[ev] = {
      total: ls.length,
      contacted: ls.filter((l) => !!l.first_sent_at || ['AWAITING_REPLY', 'REPLIED', 'CONFIRMED', 'DECLINED'].includes(l.state)).length,
      replied: ls.filter((l) => !!l.last_inbound_at || ['REPLIED', 'CONFIRMED', 'DECLINED'].includes(l.state)).length,
      confirmed: conf.length,
      declined: ls.filter((l) => l.state === 'DECLINED').length,
      opted_out: ls.filter((l) => l.state === 'OPTED_OUT' || l.opt_out).length,
      needs_pa: ls.filter((l) => l.needs_pa && !l.pa_forwarded).length,
      no_whatsapp: ls.filter((l) => l.state === 'NO_WHATSAPP').length,
      s1: conf.filter((l) => l.session === 'S1').length,
      s2: conf.filter((l) => l.session === 'S2').length,
      guests_confirmed: conf.reduce((n, l) => n + (l.guests ?? 0), 0),
    };
  }
  return d;
}
