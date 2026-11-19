import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import type { EventCode } from '../../../config/events';
import { sessionInfo } from '../../../config/events';
import type { LeadView } from '../../domain/dashboard';
import { guestsLabel, STATE_LABEL, type LeadState } from '../../domain/types';
import { api } from '../api';
import { CaseChip, ErrorBox, Loading, StateChip } from '../shared';

export function exportXlsx(leads: LeadView[]) {
  const wb = XLSX.utils.book_new();
  for (const ev of ['ROADSHOW', 'JESSELTON'] as EventCode[]) {
    const rows = leads.filter((l) => l.event === ev).map((l) => ({
      Nama: l.full_name,
      Nomor: l.phone_e164,
      ...(ev === 'ROADSHOW' ? { Tanggal: l.visit_date_label || 'Belum pasti', 'Jam datang': l.arrival_time } : { Sesi: sessionInfo(l.session)?.label ?? 'Belum pasti', 'Jumlah tamu': guestsLabel(l) ?? '' }),
      Status: STATE_LABEL[l.state],
      'Perlu PA': l.needs_pa ? 'Ya' : '',
      'Waktu PA': l.pa_preferred_time,
      'Sudah diteruskan ke PA': l.pa_forwarded ? 'Ya' : '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), ev === 'ROADSHOW' ? 'Roadshow' : 'Jesselton');
  }
  XLSX.writeFile(wb, `rekap-kehadiran-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function LeadsPage() {
  const [leads, setLeads] = useState<LeadView[] | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<EventCode>('ROADSHOW');
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [kase, setKase] = useState('');
  const load = () => { setErr(''); api('/api/leads').then((r) => setLeads(r.leads)).catch((e) => setErr(e.message)); };
  useEffect(load, []);
  const list = useMemo(() => (leads ?? []).filter((l) => l.event === tab && (!state || l.state === state) && (!kase || l.case === kase)
    && (!q || `${l.full_name} ${l.call_name}`.toLowerCase().includes(q.toLowerCase()))), [leads, tab, q, state, kase]);
  const cases = useMemo(() => [...new Set((leads ?? []).filter((l) => l.event === tab).map((l) => l.case))].sort(), [leads, tab]);
  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!leads) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Daftar Lead</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={load}>Muat ulang</button>
          <button className="btn-ghost" onClick={() => exportXlsx(leads)}>Ekspor .xlsx</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['ROADSHOW', 'JESSELTON'] as EventCode[]).map((ev) => (
          <button key={ev} onClick={() => { setTab(ev); setKase(''); }} className={`btn ${tab === ev ? (ev === 'ROADSHOW' ? 'bg-navy text-white' : 'bg-forest text-white') : 'border border-stone-300 bg-white'}`}>
            {ev === 'ROADSHOW' ? 'Roadshow' : 'Jesselton'} ({leads.filter((l) => l.event === ev).length})
          </button>
        ))}
      </div>
      <input className="input" placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" value={kase} onChange={(e) => setKase(e.target.value)}>
          <option value="">Semua kasus</option>
          {cases.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <ul className="card divide-y divide-stone-100 p-0">
        {list.map((l) => (
          <li key={l.lead_id}>
            <Link to={`/room/${l.lead_id}`} className="flex min-h-14 items-center gap-2 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{l.full_name}</div>
                <div className="text-xs text-stone-500">
                  {l.call_name}{l.call_name_needs_review && ' · nama perlu dicek'}{l.event === 'ROADSHOW' ? ` · ${l.visit_date_label || 'Belum pasti'}` : ` · ${sessionInfo(l.session)?.label ?? 'sesi belum'} · ${guestsLabel(l) ?? 'tamu ?'}`}
                </div>
              </div>
              <StateChip state={l.state as LeadState} />
              <CaseChip code={l.case} />
            </Link>
          </li>
        ))}
        {!list.length && <li className="p-4 text-sm text-stone-500">Tidak ada lead.</li>}
      </ul>
    </div>
  );
}
