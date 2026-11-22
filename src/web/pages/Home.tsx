import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Dashboard, LeadView, QueueItem } from '../../domain/dashboard';
import { api } from '../api';
import { ErrorBox, EventDot, EVENT_LABEL, Loading } from '../shared';

const SECTION_COLORS = ['#e9407a', '#5b4cf5', '#f0670f', '#8b3ff2', '#c27803', '#0ea5e9'];

export function HomePage() {
  const [data, setData] = useState<{ leads: LeadView[]; dashboard: Dashboard } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => { setErr(''); setBusy(true); api('/api/dashboard').then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(load, []);
  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!data) return <Loading />;
  const d = data.dashboard;
  const sections: [string, QueueItem[], string?][] = [
    ['Waiting for your reply', d.unanswered],
    ['First message not sent', d.first_messages, '/bulk?kind=first'],
    ['Reminders to send', d.reminders, '/bulk?kind=reminder'],
    ['Forward to Property Advisor', d.pa],
    ['Check greeting name', d.name_review],
  ];
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
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
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
                <div><dt className="text-ink-3">New</dt><dd className="font-medium tabular-nums">{s.new}</dd></div>
                <div><dt className="text-ink-3">Reminder</dt><dd className="font-medium tabular-nums">{s.reminder}<span className="text-ink-3"> · {s.reminder_due} to send</span></dd></div>
                <div><dt className="text-ink-3">Done</dt><dd className="font-medium tabular-nums">{s.done}</dd></div>
              </dl>
              {ev === 'JESSELTON' && (s.s1 + s.s2 > 0) && <p className="mt-2 text-xs text-ink-3">Session 1: {s.s1} · Session 2: {s.s2}</p>}
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="mb-2 px-1 text-[15px] font-semibold">Work queue</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sections.map(([title, items, link], idx) => (
            <Link key={title} to={link ?? '/leads'} className="card transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-2 text-xs text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: SECTION_COLORS[idx % SECTION_COLORS.length] }} />{title}</div>
              <div className="mt-1 text-[28px] font-semibold tabular-nums leading-none tracking-[-0.02em]">{items.length}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
