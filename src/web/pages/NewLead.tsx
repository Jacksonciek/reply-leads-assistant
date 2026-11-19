import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventCode } from '../../../config/events';
import { parseBitrixTitle } from '../../domain/bitrix-title';
import { deriveCallName } from '../../domain/names';
import { parseWaPaste } from '../../domain/parse-wa-paste';
import { normalizePhone } from '../../domain/phone';
import { DATE_OPTIONS } from '../../domain/sheet-row';
import { useConfig } from '../App';
import { api, ApiError } from '../api';
import { useToast, Warnings } from '../shared';

const DATES = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const STATUSES = [
  ['NEW', 'Belum chat'], ['AWAITING_REPLY', 'Belum balas'], ['REPLIED', 'Sudah balas'], ['NO_WHATSAPP', 'No WhatsApp'],
] as const;

interface Form {
  event: EventCode; full_name: string; gender: '' | 'Bapak' | 'Ibu'; phone: string; email: string; source: '' | 'Agent' | 'Meta' | 'Website';
  call_name: string; call_name_touched: boolean; visit_date: string; arrival_time: string; session: 'S1' | 'S2' | 'UNDECIDED';
  info_only: boolean; guests: '' | '1' | '2' | '3+'; state: typeof STATUSES[number][0] | ''; last_contacted_at: string; pasted_history: string;
}
const blank = (event: EventCode = 'ROADSHOW'): Form => ({
  event, full_name: '', gender: '', phone: '', email: '', source: event === 'ROADSHOW' ? 'Agent' : 'Meta', call_name: '', call_name_touched: false,
  visit_date: '', arrival_time: '', session: 'UNDECIDED', info_only: false, guests: '', state: '', last_contacted_at: '', pasted_history: '',
});

export function NewLeadPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { cfg } = useConfig();
  const [title, setTitle] = useState('');
  const [f, setF] = useState<Form>(blank());
  const [warn, setWarn] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<{ id: string; msg: string } | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const cn = useMemo(() => deriveCallName(f.full_name), [f.full_name]);
  const callName = f.call_name_touched ? f.call_name : cn.callName;
  const ph = useMemo(() => normalizePhone(f.phone), [f.phone]);
  const pastePreview = useMemo(() => (f.pasted_history ? parseWaPaste(f.pasted_history, cfg?.config.my_whatsapp_name || 'Jackson') : []), [f.pasted_history, cfg]);

  const applyTitle = (t: string) => {
    setTitle(t);
    if (!t.includes('|')) return;
    const p = parseBitrixTitle(t);
    setF((x) => ({
      ...x, event: p.event ?? x.event, full_name: p.full_name, call_name_touched: false,
      source: p.source || (p.event === 'ROADSHOW' ? 'Agent' : x.source), visit_date: p.visit_date ?? '',
    }));
    setWarn(p.warnings.map((w) => w.message));
  };

  const submit = async (next: boolean) => {
    if (!f.state) { toast('Pilih status saat ini', 'err'); return; }
    setBusy(true); setDup(null);
    const body: Record<string, unknown> = {
      event: f.event, full_name: f.full_name, gender: f.gender, phone: f.phone, email: f.email, source: f.source, state: f.state,
      call_name: callName, call_name_ok: f.call_name_touched || !cn.needsReview,
    };
    if (f.event === 'ROADSHOW') { body.visit_date = f.visit_date || null; body.arrival_time = f.arrival_time; }
    else {
      body.session = f.info_only && f.session === 'UNDECIDED' ? 'UNDECIDED' : f.session;
      body.info_only = f.info_only;
      if (f.guests === '1' || f.guests === '2') body.guests = Number(f.guests);
      body.guests_bucket = f.guests === '3+' ? '3+' : f.guests ? '' : 'unknown';
    }
    if (f.state === 'AWAITING_REPLY' && f.last_contacted_at) body.last_contacted_at = new Date(f.last_contacted_at).toISOString();
    if (f.state === 'REPLIED' && f.pasted_history.trim()) body.pasted_history = f.pasted_history;
    try {
      const r = await api<{ lead_id: string }>('/api/leads', { body });
      toast('Lead tersimpan');
      if (next) { setF(blank(f.event)); setTitle(''); setWarn([]); window.scrollTo(0, 0); }
      else nav(`/room/${r.lead_id}${f.state === 'REPLIED' && f.pasted_history.trim() ? '?generate=1' : ''}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate') setDup({ id: e.data?.lead_id, msg: e.message });
      else toast((e as Error).message, 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Lead Baru</h1>
      <div className="card">
        <label className="label">Judul lead Bitrix (opsional)</label>
        <input className="input" placeholder="Nama | KL Property Roadshow Medan - Nov26 | 23/11" value={title} onChange={(e) => applyTitle(e.target.value)} />
        <Warnings items={warn} />
      </div>
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(['ROADSHOW', 'JESSELTON'] as EventCode[]).map((ev) => (
            <button key={ev} type="button" onClick={() => setF((x) => ({ ...x, event: ev, source: ev === 'ROADSHOW' ? 'Agent' : x.source === 'Agent' ? 'Meta' : x.source }))}
              className={`btn ${f.event === ev ? (ev === 'ROADSHOW' ? 'bg-navy text-white' : 'bg-forest text-white') : 'border border-stone-300 bg-white'}`}>
              {ev === 'ROADSHOW' ? 'Roadshow' : 'Jesselton'}
            </button>
          ))}
        </div>
        <div><label className="label">Nama (seperti di Bitrix)</label><input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Gender</label>
            <select className="input" value={f.gender} onChange={(e) => set('gender', e.target.value as Form['gender'])}>
              <option value="">(kosong → Bapak/Ibu)</option><option>Bapak</option><option>Ibu</option>
            </select>
          </div>
          <div>
            <label className="label">Nama sapaan {cn.needsReview && !f.call_name_touched && <span className="text-amber-700">· perlu dicek</span>}</label>
            <input className="input" value={callName} onChange={(e) => setF((x) => ({ ...x, call_name: e.target.value, call_name_touched: true }))} />
          </div>
        </div>
        {cn.agentName && <p className="text-xs text-stone-500">Nama agen (tidak dipakai di pesan): {cn.agentName}</p>}
        <div>
          <label className="label">Nomor WhatsApp</label>
          <input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08… / 62… / wa.me/…" />
          {f.phone && <p className={`mt-1 text-xs ${ph.invalid ? 'text-red-700' : 'text-stone-500'}`}>{ph.invalid ? 'Nomor tidak valid' : `Tersimpan sebagai ${ph.phone}`}</p>}
          {dup && <p className="mt-1 text-sm text-red-700">{dup.msg}. <Link className="underline" to={`/room/${dup.id}`}>Buka room lama</Link></p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Email (opsional)</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div>
            <label className="label">Sumber</label>
            <select className="input" value={f.source} onChange={(e) => set('source', e.target.value as Form['source'])}>
              {f.event === 'ROADSHOW' ? <option value="Agent">Agen</option> : <><option value="Meta">Meta (FB/IG)</option><option value="Website">Website</option></>}
            </select>
          </div>
        </div>

        {f.event === 'ROADSHOW' ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Tanggal kunjungan</label>
              <select className="input" value={f.visit_date} onChange={(e) => set('visit_date', e.target.value)}>
                <option value="">Belum pasti</option>
                {DATES.map((d, i) => <option key={d} value={d}>{DATE_OPTIONS[i]}</option>)}
              </select>
            </div>
            <div><label className="label">Perkiraan jam datang</label><input className="input" type="time" value={f.arrival_time} onChange={(e) => set('arrival_time', e.target.value)} /></div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Sesi</label>
                <select className="input" value={f.session} onChange={(e) => set('session', e.target.value as Form['session'])}>
                  <option value="S1">11.00–13.00</option><option value="S2">15.00–17.00</option><option value="UNDECIDED">Belum pasti</option>
                </select>
              </div>
              <div>
                <label className="label">Jumlah tamu</label>
                <select className="input" value={f.guests} onChange={(e) => set('guests', e.target.value as Form['guests'])}>
                  <option value="">Belum tahu</option><option value="1">1 orang</option><option value="2">2 orang</option><option value="3+">3 orang atau lebih</option>
                </select>
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.info_only} onChange={(e) => set('info_only', e.target.checked)} /> Kirim info saja</label>
          </div>
        )}

        <div>
          <label className="label">Status saat ini (wajib)</label>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map(([k, v]) => (
              <button key={k} type="button" onClick={() => set('state', k)} className={`btn ${f.state === k ? 'bg-gold text-white' : 'border border-stone-300 bg-white'}`}>{v}</button>
            ))}
          </div>
        </div>
        {f.state === 'AWAITING_REPLY' && (
          <div><label className="label">Terakhir dihubungi (opsional, default 24 jam lalu)</label><input className="input" type="datetime-local" value={f.last_contacted_at} onChange={(e) => set('last_contacted_at', e.target.value)} /></div>
        )}
        {f.state === 'REPLIED' && (
          <div>
            <label className="label">Tempel riwayat chat (salinan WhatsApp didukung)</label>
            <textarea className="input min-h-32" value={f.pasted_history} onChange={(e) => set('pasted_history', e.target.value)} />
            {pastePreview.length > 0 && <p className="mt-1 text-xs text-stone-500">{pastePreview.length} pesan terdeteksi ({pastePreview.filter((m) => m.direction === 'IN').length} dari klien, {pastePreview.filter((m) => m.direction === 'OUT').length} dari saya)</p>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={busy || !f.full_name || !f.phone} onClick={() => submit(false)}>Simpan & buka room</button>
        <button className="btn-ghost flex-1" disabled={busy || !f.full_name || !f.phone} onClick={() => submit(true)}>Simpan & lead berikutnya</button>
      </div>
    </div>
  );
}
