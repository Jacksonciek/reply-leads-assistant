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
    try { await api('/api/faq', { method: 'PUT', body: x }); toast('FAQ disimpan'); setF(EMPTY); load(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  if (err) return <ErrorBox error={err} />;
  if (!list) return <Loading />;
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Pengetahuan (FAQ)</h1>
      <p className="text-sm text-stone-600">Hanya FAQ yang disetujui yang dipakai untuk membuat draft. Jangan masukkan harga atau spesifikasi produk.</p>
      <div className="card space-y-2">
        <select className="input" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value as Faq['event'] })}>
          <option value="ALL">Semua acara</option><option value="ROADSHOW">Roadshow</option><option value="JESSELTON">Jesselton</option>
        </select>
        <input className="input" placeholder="Pertanyaan" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        <textarea className="input min-h-20" placeholder="Jawaban" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.approved} onChange={(e) => setF({ ...f, approved: e.target.checked })} /> Disetujui</label>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={!f.question || !f.answer} onClick={() => save()}>{f.faq_id ? 'Simpan perubahan' : 'Tambah FAQ'}</button>
          {f.faq_id && <button className="btn-ghost" onClick={() => setF(EMPTY)}>Batal</button>}
        </div>
      </div>
      <ul className="space-y-2">
        {list.map((x) => (
          <li key={x.faq_id} className="card text-sm">
            <div className="flex items-center gap-2">
              <span className="chip bg-stone-100">{x.event}</span>
              <span className={`chip ${x.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{x.approved ? 'Disetujui' : 'Belum disetujui'}</span>
            </div>
            <p className="mt-1 font-medium">{x.question}</p>
            <p className="text-stone-700">{x.answer}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost" onClick={() => setF(x)}>Edit</button>
              {!x.approved && <button className="btn-ghost" onClick={() => save({ ...x, approved: true })}>Setujui</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
