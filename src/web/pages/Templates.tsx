import { useEffect, useMemo, useState } from 'react';
import { EVENTS } from '../../../config/events';
import { buildVars, render, validateTemplate } from '../../domain/templates';
import { dateLabel } from '../../domain/time';
import { emptyLead } from '../../domain/types';
import { api } from '../api';
import { ErrorBox, Loading, useToast } from '../shared';

interface Tpl { code: string; event: string; kind: string; body: string; status: string; description: string; default_body: string }

const SAMPLE = {
  ROADSHOW: emptyLead({ event: 'ROADSHOW', call_name: 'Anita', gender: 'Ibu', visit_date: '2026-11-23', visit_date_label: dateLabel('2026-11-23'), arrival_time: '14:00', source: 'Agent', last_inbound_at: new Date(Date.now() - 86400000).toISOString() }),
  JESSELTON: emptyLead({ event: 'JESSELTON', call_name: 'Bolon', gender: 'Bapak', session: 'S2', guests: 2, guests_bucket: '', source: 'Meta', visit_date: '2026-11-28' }),
};

export function TemplatesPage() {
  const toast = useToast();
  const [list, setList] = useState<Tpl[] | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Tpl | null>(null);
  const [body, setBody] = useState('');
  const load = () => api('/api/templates').then((r) => setList(r.templates)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const errors = useMemo(() => (sel ? validateTemplate(body) : []), [sel, body]);
  const preview = useMemo(() => {
    if (!sel) return '';
    const lead = sel.event === 'JESSELTON' ? SAMPLE.JESSELTON : SAMPLE.ROADSHOW;
    try { return render(body, buildVars(lead, EVENTS, new Date(), { waktu_obrolan: 'kemarin', guests_variant: 'empty' })); } catch (e) { return `(${(e as Error).message})`; }
  }, [sel, body]);

  const save = async (status: 'APPROVED' | 'NEW_NEEDS_REVIEW') => {
    if (!sel) return;
    try {
      await api('/api/templates', { method: 'PUT', body: { code: sel.code, body, status, event: sel.event } });
      toast(status === 'APPROVED' ? 'Disimpan dan disetujui' : 'Disimpan (perlu ditinjau)');
      setSel(null); load();
    } catch (e) { toast((e as Error).message, 'err'); }
  };

  if (err) return <ErrorBox error={err} />;
  if (!list) return <Loading />;
  if (sel) {
    return (
      <div className="space-y-3">
        <button className="text-sm text-navy underline" onClick={() => setSel(null)}>← Semua template</button>
        <h1 className="text-lg font-semibold">{sel.code}</h1>
        <p className="text-sm text-stone-600">{sel.description}</p>
        <textarea className="input min-h-72 font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        {errors.map((e) => <p key={e} className="text-sm text-red-700">{e}</p>)}
        <div className="card"><div className="label">Pratinjau (data contoh)</div><pre className="whitespace-pre-wrap font-sans text-sm">{preview}</pre></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!!errors.length} onClick={() => save('APPROVED')}>Simpan & setujui</button>
          <button className="btn-ghost" disabled={!!errors.length} onClick={() => save('NEW_NEEDS_REVIEW')}>Simpan sebagai perlu ditinjau</button>
          {sel.default_body && body !== sel.default_body && <button className="btn-ghost" onClick={() => setBody(sel.default_body)}>Kembalikan ke bawaan</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Template & teks tetap</h1>
      <ul className="card divide-y divide-stone-100 p-0">
        {list.map((t) => (
          <li key={t.code}>
            <button className="flex min-h-14 w-full items-center gap-2 px-4 py-2 text-left" onClick={() => { setSel(t); setBody(t.body); }}>
              <span className="w-32 shrink-0 font-mono text-sm">{t.code}</span>
              <span className="flex-1 text-xs text-stone-600">{t.description}</span>
              <span className={`chip ${t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{t.status === 'APPROVED' ? 'Disetujui' : 'Perlu ditinjau'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
