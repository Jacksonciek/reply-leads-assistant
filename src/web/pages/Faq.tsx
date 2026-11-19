import { useEffect, useState } from 'react';
import type { Faq } from '../../domain/types';
import { api } from '../api';
import { ErrorBox, Loading, useToast } from '../shared';

const EMPTY: Omit<Faq, 'faq_id' | 'updated_at'> & { faq_id?: string } = { event: 'ALL', question: '', answer: '', approved: false };

export function FaqPage() {
  const toast = useToast();
  const [list, setList] = useState<Faq[] | null>(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState(EMPTY);
  const load = () => api('/api/faq').then((r) => setList(r.faq)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const save = async (x = f) => {
    try { await api('/api/faq', { method: 'PUT', body: x }); toast('Saved'); setF(EMPTY); load(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  if (err) return <ErrorBox error={err} />;
  if (!list) return <Loading />;
  return (
    <div className="space-y-3">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Knowledge</h1>
      <p className="text-sm text-ink-2">Only approved answers are used for drafts. Do not add prices or product specifications. Write answers in Indonesian — they are sent to clients.</p>
      <div className="card space-y-2">
        <select className="input" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value as Faq['event'] })}>
          <option value="ALL">All events</option><option value="ROADSHOW">Roadshow</option><option value="JESSELTON">Jesselton</option>
        </select>
        <input className="input" placeholder="Question" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        <textarea className="input min-h-20" placeholder="Answer" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.approved} onChange={(e) => setF({ ...f, approved: e.target.checked })} /> Approved</label>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={!f.question || !f.answer} onClick={() => save()}>{f.faq_id ? 'Save changes' : 'Add answer'}</button>
          {f.faq_id && <button className="btn-ghost" onClick={() => setF(EMPTY)}>Cancel</button>}
        </div>
      </div>
      <ul className="space-y-2">
        {list.map((x) => (
          <li key={x.faq_id} className="card text-sm">
            <div className="flex items-center gap-2">
              <span className="chip bg-canvas">{x.event}</span>
              <span className={`chip ${x.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{x.approved ? 'Approved' : 'Not approved'}</span>
            </div>
            <p className="mt-1 font-medium">{x.question}</p>
            <p className="text-ink-2">{x.answer}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost" onClick={() => setF(x)}>Edit</button>
              {!x.approved && <button className="btn-ghost" onClick={() => save({ ...x, approved: true })}>Approve</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
