import { useEffect, useState } from 'react';
import { useConfig } from '../App';
import { api } from '../api';
import { Loading, useToast } from '../shared';

const FIELDS: [string, string, string?][] = [
  ['event.ROADSHOW.team_name', 'Nama tim Roadshow ("tim …")'],
  ['event.ROADSHOW.display_name', 'Nama acara Roadshow'],
  ['event.ROADSHOW.short_name', 'Sebutan singkat Roadshow'],
  ['event.ROADSHOW.opening_hours', 'Jam operasional Roadshow (kosong = belum diketahui)', 'mis. 10.00–21.00 WIB'],
  ['my_whatsapp_name', 'Nama WhatsApp saya (untuk memisahkan salinan chat)'],
  ['gemini_model', 'Model Gemini (kosong = pakai GEMINI_MODEL dari server)'],
];

export function SettingsPage() {
  const { cfg, reload } = useConfig();
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Record<string, string>>({});
  const [setupLog, setSetupLog] = useState<string[] | null>(null);
  useEffect(() => { if (cfg) setV(cfg.config); }, [cfg]);
  if (!cfg) return <Loading />;

  const save = async () => {
    try { await api('/api/config', { method: 'PUT', body: v }); toast('Pengaturan disimpan'); reload(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const test = async (what: 'sheets' | 'gemini') => {
    setHealth((h) => ({ ...h, [what]: 'Menguji…' }));
    const r = await api<{ ok: boolean; message: string; models?: string[] }>(`/api/health/${what}`, { body: {} }).catch((e) => ({ ok: false, message: e.message, models: undefined }));
    setHealth((h) => ({ ...h, [what]: `${r.ok ? '✓' : '✗'} ${r.message}${r.models?.length ? `\nModel tersedia: ${r.models.join(', ')}` : ''}` }));
  };
  const setup = async () => {
    try { const r = await api<{ log: string[] }>('/api/setup', { body: {} }); setSetupLog(r.log); } catch (e) { toast((e as Error).message, 'err'); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Pengaturan</h1>
      <div className="card space-y-3">
        {FIELDS.map(([k, label, ph]) => (
          <div key={k}><label className="label">{label}</label><input className="input" placeholder={ph} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
        <div>
          <label className="label">Format link pembuka WhatsApp</label>
          <select className="input" value={v.link_format ?? 'wa.me'} onChange={(e) => setV({ ...v, link_format: e.target.value })}>
            <option value="wa.me">wa.me (umum, HP memilih aplikasi)</option>
            <option value="android_business">Android: langsung WhatsApp Business</option>
          </select>
        </div>
        <p className="text-xs text-stone-500">Server: GEMINI_MODEL = {cfg.env.GEMINI_MODEL || '-'}, fallback = {cfg.env.GEMINI_FALLBACK_MODEL || '-'}, penyimpanan = {cfg.env.store}{cfg.env.store === 'memory' && ' (data hilang saat restart!)'}, Gemini {cfg.env.gemini_configured ? 'terkonfigurasi' : 'belum dikonfigurasi'}.</p>
        <button className="btn-primary" onClick={save}>Simpan</button>
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">Uji koneksi</h2>
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => test('sheets')}>Uji Google Sheets</button><button className="btn-ghost" onClick={() => test('gemini')}>Uji Gemini</button></div>
        {Object.entries(health).map(([k, m]) => <pre key={k} className="whitespace-pre-wrap rounded-md bg-stone-50 p-2 font-sans text-xs">{k}: {m}</pre>)}
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">Siapkan Google Sheet</h2>
        <p className="text-xs text-stone-600">Membuat tab, header, dropdown, dan template bawaan yang belum ada. Aman dijalankan berulang.</p>
        <button className="btn-ghost" onClick={setup}>Jalankan setup</button>
        {setupLog && <ul className="text-xs">{(setupLog.length ? setupLog : ['Tidak ada perubahan']).map((l) => <li key={l}>• {l}</li>)}</ul>}
      </div>
    </div>
  );
}
