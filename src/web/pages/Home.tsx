import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventCode } from '../../../config/events';
import type { Dashboard, LeadView } from '../../domain/dashboard';
import { WA_STATUS_LABEL, type WaStatus } from '../../domain/types';
import { api } from '../api';
import { ErrorBox, EventDot, EVENT_LABEL, Loading, useView } from '../shared';

/** The four numbers per event. */
const METRICS: { status: Exclude<WaStatus, ''>; dot: string }[] = [
  { status: 'NO_REPLY', dot: 'bg-orange-500' },
  { status: 'NO_HOPE', dot: 'bg-pink-400' },
  { status: 'BAD_LEAD', dot: 'bg-red-700' },
  { status: 'CONFIRMED', dot: 'bg-emerald-500' },
];

export function HomePage() {
  const [data, setData] = useState<{ leads: LeadView[]; dashboard: Dashboard } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { base } = useView();
  const load = () => { setErr(''); setBusy(true); api('/api/dashboard').then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(load, []);
  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!data) return <Loading />;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{today}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em]">Dashboard</h1>
        </div>
        <button className="btn-quiet" onClick={load} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(['ROADSHOW', 'JESSELTON'] as EventCode[]).map((ev) => {
          const s = data.dashboard.stats[ev];
          return (
            <section key={ev} className={`card border-transparent ${ev === 'ROADSHOW' ? 'bg-navy-soft' : 'bg-forest-soft'}`}>
              <div className="flex items-center gap-2">
                <EventDot event={ev} />
                <h2 className="text-[17px] font-semibold">{EVENT_LABEL[ev]}</h2>
                <Link to={`${base}/leads?ev=${ev}`} className="ml-auto text-xs text-ink-3 hover:text-ink">{s.total} leads ›</Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {METRICS.map((m) => (
                  <Link key={m.status} to={`${base}/leads?ev=${ev}&s=${m.status}`} className="rounded-xl bg-white/80 p-3 transition-transform hover:-translate-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-ink-3"><span className={`h-2 w-2 rounded-full ${m.dot}`} />{WA_STATUS_LABEL[m.status]}</div>
                    <div className="mt-1 text-[30px] font-semibold tabular-nums leading-none tracking-[-0.02em]">{s.wa[m.status] ?? 0}</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
