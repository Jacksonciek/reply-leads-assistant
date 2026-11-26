import { useEffect, useState } from 'react';
import { useConfig } from '../App';
import { api } from '../api';
import { Loading, useToast } from '../shared';

const FIELDS: [string, string, string?][] = [
  ['event.ROADSHOW.team_name', 'Roadshow team name ("tim …")'],
  ['event.ROADSHOW.display_name', 'Roadshow event name'],
  ['event.ROADSHOW.short_name', 'Roadshow short name'],
  ['event.ROADSHOW.opening_hours', 'Roadshow opening hours (empty = unknown)', 'e.g. 10.00–21.00 WIB'],
  ['my_whatsapp_name', 'My WhatsApp name (to split pasted chats)'],
  ['gemini_model', 'Gemini model (empty = use the server GEMINI_MODEL)'],
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
    try { await api('/api/config', { method: 'PUT', body: v }); toast('Settings saved'); reload(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const test = async (what: 'sheets' | 'gemini') => {
    setHealth((h) => ({ ...h, [what]: 'Testing…' }));
    const r = await api<{ ok: boolean; message: string; models?: string[] }>(`/api/health/${what}`, { body: {} }).catch((e) => ({ ok: false, message: e.message, models: undefined }));
    setHealth((h) => ({ ...h, [what]: `${r.ok ? '✓' : '✗'} ${r.message}${r.models?.length ? `\nAvailable models: ${r.models.join(', ')}` : ''}` }));
  };
  const setup = async () => {
    try { const r = await api<{ log: string[] }>('/api/setup', { body: {} }); setSetupLog(r.log); } catch (e) { toast((e as Error).message, 'err'); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Adjustments</h1>
      <div className="card space-y-3">
        {FIELDS.map(([k, label, ph]) => (
          <div key={k}><label className="label">{label}</label><input className="input" placeholder={ph} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
        <div>
          <label className="label">WhatsApp link format</label>
          <select className="input" value={v.link_format ?? 'wa.me'} onChange={(e) => setV({ ...v, link_format: e.target.value })}>
            <option value="wa.me">wa.me (general, phone picks the app)</option>
            <option value="android_business">Android: open WhatsApp Business directly</option>
          </select>
        </div>
        <p className="text-xs text-ink-3">Server: GEMINI_MODEL = {cfg.env.GEMINI_MODEL || '-'}, fallback = {cfg.env.GEMINI_FALLBACK_MODEL || '-'}, storage = {cfg.env.store}{cfg.env.store === 'memory' && ' (data is lost on restart!)'}, Gemini {cfg.env.gemini_configured ? 'configured' : 'not configured'}.</p>
        <button className="btn-primary" onClick={save}>Save</button>
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">Test connections</h2>
        <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => test('sheets')}>Test Google Sheets</button><button className="btn-ghost" onClick={() => test('gemini')}>Test Gemini</button></div>
        {Object.entries(health).map(([k, m]) => <pre key={k} className="whitespace-pre-wrap rounded-md bg-canvas p-2 font-sans text-xs">{k}: {m}</pre>)}
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">Prepare Google Sheet</h2>
        <p className="text-xs text-ink-2">Creates missing tabs, headers, dropdowns and default templates. Safe to run repeatedly.</p>
        <button className="btn-ghost" onClick={setup}>Run setup</button>
        {setupLog && <ul className="text-xs">{(setupLog.length ? setupLog : ['No changes']).map((l) => <li key={l}>• {l}</li>)}</ul>}
      </div>
    </div>
  );
}
