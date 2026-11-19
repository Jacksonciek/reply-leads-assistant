import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Dashboard, LeadView, QueueItem } from '../../domain/dashboard';
import { api } from '../api';
import { CaseChip, ErrorBox, EventChip, EVENT_LABEL, Loading } from '../shared';

export function HomePage() {
  const [data, setData] = useState<{ leads: LeadView[]; dashboard: Dashboard } | null>(null);
  const [err, setErr] = useState('');
  const load = () => { setErr(''); api('/api/dashboard').then(setData).catch((e) => setErr(e.message)); };
  useEffect(load, []);
  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!data) return <Loading />;
  const byId = new Map(data.leads.map((l) => [l.lead_id, l]));
  const d = data.dashboard;
  const sections: [string, QueueItem[], string?][] = [
    ['Pesan klien belum dibalas', d.unanswered],
    ['Pesan pertama belum dikirim', d.first_messages, '/massal?kind=first'],
    ['Reminder jatuh tempo', d.reminders, '/massal?kind=reminder'],
    ['Pengingat H-1', d.h1, '/massal?kind=h1'],
    ['Perlu diteruskan ke Property Advisor', d.pa],
    ['Nama sapaan perlu dicek', d.name_review],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Hari Ini</h1>
        <button className="btn-ghost" onClick={load}>Muat ulang data</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['ROADSHOW', 'JESSELTON'] as const).map((ev) => {
          const s = d.stats[ev];
          return (
            <div key={ev} className={`card border-l-4 ${ev === 'ROADSHOW' ? 'border-l-navy' : 'border-l-forest'}`}>
              <div className="mb-2 font-semibold">{EVENT_LABEL[ev]}</div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[['Total', s.total], ['Dihubungi', s.contacted], ['Membalas', s.replied], ['Konfirmasi', s.confirmed], ['Menolak', s.declined], ['Opt-out', s.opted_out], ['Perlu PA', s.needs_pa], ['No WA', s.no_whatsapp]].map(([k, v]) => (
                  <div key={k as string}><div className="text-lg font-semibold">{v}</div><div className="text-stone-500">{k}</div></div>
                ))}
              </div>
              {ev === 'JESSELTON' && <p className="mt-2 text-xs text-stone-600">Terkonfirmasi: Sesi 1 {s.s1} · Sesi 2 {s.s2} · Total tamu {s.guests_confirmed}</p>}
            </div>
          );
        })}
      </div>
      {sections.map(([title, items, link]) => items.length > 0 && (
        <section key={title} className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{title} <span className="text-stone-400">({items.length})</span></h2>
            {link && <Link to={link} className="text-sm text-navy underline">Buka di Generator Massal</Link>}
          </div>
          <ul className="divide-y divide-stone-100">
            {items.map((it) => {
              const l = byId.get(it.lead_id);
              if (!l) return null;
              return (
                <li key={it.lead_id}>
                  <Link to={`/room/${l.lead_id}`} className="flex min-h-12 items-center gap-2 py-2">
                    <EventChip event={l.event} />
                    <span className="flex-1 truncate text-sm font-medium">{l.call_name || l.full_name}</span>
                    {it.attention && <span className="chip bg-red-100 text-red-700">Perlu perhatian</span>}
                    <span className="hidden text-xs text-stone-500 sm:inline">{it.reason}</span>
                    <CaseChip code={l.case} />
                  </Link>
                  <p className="-mt-1 pb-2 text-xs text-stone-500 sm:hidden">{it.reason}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {sections.every(([, i]) => !i.length) && <p className="card text-sm text-stone-600">Tidak ada yang perlu dihubungi saat ini.</p>}
    </div>
  );
}
