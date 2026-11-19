import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Dashboard, LeadView, QueueItem } from '../../domain/dashboard';
import { api } from '../api';
import { Avatar, CaseChip, ErrorBox, EventDot, EVENT_LABEL, Loading } from '../shared';
import { relTime } from './Leads';

const SECTION_COLORS = ['#e9407a', '#5b4cf5', '#f0670f', '#8b3ff2', '#c27803', '#0ea5e9'];

export function HomePage() {
  const [data, setData] = useState<{ leads: LeadView[]; dashboard: Dashboard } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => { setErr(''); setBusy(true); api('/api/dashboard').then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(load, []);
  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!data) return <Loading />;
  const byId = new Map(data.leads.map((l) => [l.lead_id, l]));
  const d = data.dashboard;
  const sections: [string, QueueItem[], string?][] = [
    ['Waiting for your reply', d.unanswered],
    ['First message not sent', d.first_messages, '/bulk?kind=first'],
    ['Reminders due', d.reminders, '/bulk?kind=reminder'],
    ['Day-before reminders', d.h1, '/bulk?kind=h1'],
    ['Forward to Property Advisor', d.pa],
    ['Check greeting name', d.name_review],
  ];
  const recent = [...data.leads].filter((l) => l.room.last_at).sort((a, b) => b.room.last_at!.localeCompare(a.room.last_at!)).slice(0, 6);
  const todo = sections.reduce((n, [, i]) => n + i.length, 0);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{today}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em]">{todo ? `${todo} ${todo === 1 ? 'thing needs' : 'things need'} attention` : 'All caught up'}</h1>
        </div>
        <button className="btn-quiet" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/leads" className="card border-transparent bg-[linear-gradient(140deg,#7c6cff,#5b4cf5)] text-white shadow-[0_10px_30px_-12px_rgba(91,76,245,0.7)] transition-transform hover:-translate-y-0.5">
          <div className="eyebrow text-white/75">Total leads</div>
          <div className="mt-1 text-[34px] font-semibold tabular-nums leading-none tracking-[-0.02em]">{data.leads.length}</div>
          <div className="mt-2 text-xs text-white/80">{d.unanswered.length} waiting for your reply</div>
        </Link>
        {(['ROADSHOW', 'JESSELTON'] as const).map((ev) => {
          const s = d.stats[ev];
          const pct = s.total ? Math.round((s.confirmed / s.total) * 100) : 0;
          return (
            <div key={ev} className={`card border-transparent ${ev === 'ROADSHOW' ? 'bg-navy-soft' : 'bg-forest-soft'}`}>
              <div className="flex items-center gap-2"><EventDot event={ev} /><span className="eyebrow">{EVENT_LABEL[ev]}</span></div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[34px] font-semibold tabular-nums leading-none tracking-[-0.02em]">{s.total}</span>
                <span className="text-xs text-ink-3">leads</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80" aria-hidden>
                <div className={`h-full rounded-full ${ev === 'ROADSHOW' ? 'bg-navy' : 'bg-forest'}`} style={{ width: `${pct}%` }} />
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
                <div><dt className="text-ink-3">Contacted</dt><dd className="font-medium tabular-nums">{s.contacted}</dd></div>
                <div><dt className="text-ink-3">Replied</dt><dd className="font-medium tabular-nums">{s.replied}</dd></div>
                <div><dt className="text-ink-3">Confirmed</dt><dd className="font-medium tabular-nums">{s.confirmed}</dd></div>
              </dl>
              {ev === 'JESSELTON' && (s.s1 + s.s2 > 0) && <p className="mt-2 text-xs text-ink-3">Session 1: {s.s1} · Session 2: {s.s2} · {s.guests_confirmed} guests</p>}
            </div>
          );
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {sections.map(([title, items, link], idx) => items.length > 0 && (
            <section key={title}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SECTION_COLORS[idx % SECTION_COLORS.length] }} />{title} <span className="font-normal tabular-nums text-ink-3">{items.length}</span></h2>
                {link && <Link to={link} className="text-[13px] text-accent">Open bulk</Link>}
              </div>
              <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                {items.map((it) => {
                  const l = byId.get(it.lead_id);
                  if (!l) return null;
                  return (
                    <li key={it.lead_id} className="border-b border-line last:border-0">
                      <Link to={`/room/${l.lead_id}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-canvas">
                        <Avatar name={l.call_name || l.full_name} event={l.event} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14.5px] font-medium">{l.full_name}</div>
                          <div className="truncate text-xs text-ink-3">{it.reason}</div>
                        </div>
                        {it.attention && <span className="chip bg-red-50 text-red-700">Attention</span>}
                        <CaseChip code={l.case} />
                        <span aria-hidden className="text-ink-3">›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!todo && (
            <div className="rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center">
              <p className="text-[15px] font-medium">Nobody needs a message right now</p>
              <p className="mt-1 text-sm text-ink-3">Paste client replies into a conversation, or add a new lead from Bitrix24.</p>
              <Link to="/leads/new" className="btn-primary mt-4">New lead</Link>
            </div>
          )}
        </div>
        <aside>
          <h2 className="mb-2 px-1 text-[15px] font-semibold">Recently updated</h2>
          {recent.length ? (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {recent.map((l) => (
                <li key={l.lead_id} className="border-b border-line last:border-0">
                  <Link to={`/room/${l.lead_id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-canvas">
                    <Avatar name={l.call_name || l.full_name} event={l.event} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2"><span className="truncate text-[14px] font-medium">{l.full_name}</span><span className="ml-auto shrink-0 text-[11px] text-ink-3">{relTime(l.room.last_at)}</span></div>
                      <div className="truncate text-xs text-ink-3">{l.room.last_dir === 'OUT' ? 'You: ' : ''}{l.room.last_text}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-1 text-sm text-ink-3">No conversations yet.</p>}
        </aside>
      </div>
    </div>
  );
}
