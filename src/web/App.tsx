import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { Loading, ToastProvider } from './shared';
import { HomePage } from './pages/Home';
import { LeadsPage } from './pages/Leads';
import { NewLeadPage } from './pages/NewLead';
import { RoomPage } from './pages/Room';
import { BulkPage } from './pages/Bulk';
import { ImportPage } from './pages/Import';
import { TemplatesPage } from './pages/Templates';
import { FaqPage } from './pages/Faq';
import { SettingsPage } from './pages/Settings';

export interface AppConfig { config: Record<string, string>; env: { GEMINI_MODEL: string; GEMINI_FALLBACK_MODEL: string; store: string; gemini_configured: boolean } }
const ConfigCtx = createContext<{ cfg: AppConfig | null; reload: () => void }>({ cfg: null, reload: () => {} });
export const useConfig = () => useContext(ConfigCtx);

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api('/api/auth/login', { body: { password: pw } }); onDone(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <h1 className="text-lg font-semibold text-navy">Generator Balasan</h1>
        <p className="mb-4 text-sm text-stone-500">Konfirmasi kehadiran Roadshow & Jesselton</p>
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
        {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary mt-4 w-full" disabled={busy || !pw}>Masuk</button>
      </form>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Hari Ini' },
  { to: '/massal', label: 'Massal' },
  { to: '/leads', label: 'Lead' },
  { to: '/lainnya', label: 'Lainnya' },
];

function MorePage() {
  const items = [
    ['/impor', 'Impor Excel'], ['/template', 'Template'], ['/faq', 'Pengetahuan (FAQ)'], ['/pengaturan', 'Pengaturan'],
  ];
  const nav = useNavigate();
  return (
    <div className="space-y-2">
      {items.map(([to, label]) => <Link key={to} to={to} className="card block font-medium">{label}</Link>)}
      <button className="btn-ghost w-full" onClick={async () => { await api('/api/auth/logout', { body: {} }); nav('/'); window.location.reload(); }}>Keluar</button>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const loc = useLocation();

  const reload = useCallback(() => { api<AppConfig>('/api/config').then(setCfg).catch(() => {}); }, []);
  useEffect(() => { api<{ authenticated: boolean }>('/api/auth/me').then((r) => setAuth(r.authenticated)).catch(() => setAuth(false)); }, []);
  useEffect(() => { if (auth) reload(); }, [auth, reload]);
  useEffect(() => {
    const h = () => setAuth(false);
    window.addEventListener('unauthorized', h);
    return () => window.removeEventListener('unauthorized', h);
  }, []);

  if (auth === null) return <Loading />;
  if (!auth) return <Login onDone={() => setAuth(true)} />;

  return (
    <ConfigCtx.Provider value={{ cfg, reload }}>
      <ToastProvider>
        <div className="mx-auto min-h-dvh max-w-3xl pb-24">
          <header className="sticky top-0 z-20 flex items-center justify-between bg-navy px-4 py-3 text-white">
            <Link to="/" className="font-semibold">Generator Balasan</Link>
            <nav className="hidden gap-4 text-sm sm:flex">
              {NAV.map((n) => <NavLink key={n.to} to={n.to} end className={({ isActive }) => (isActive ? 'text-gold' : 'text-white/80')}>{n.label}</NavLink>)}
            </nav>
          </header>
          <main className="p-4">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/massal" element={<BulkPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/baru" element={<NewLeadPage />} />
              <Route path="/room/:id" element={<RoomPage />} />
              <Route path="/impor" element={<ImportPage />} />
              <Route path="/template" element={<TemplatesPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/pengaturan" element={<SettingsPage />} />
              <Route path="/lainnya" element={<MorePage />} />
              <Route path="*" element={<p className="text-sm">Halaman tidak ditemukan. <Link className="underline" to="/">Kembali</Link></p>} />
            </Routes>
          </main>
          {loc.pathname !== '/leads/baru' && (
            <Link to="/leads/baru" className="fixed bottom-20 right-4 z-30 flex h-14 items-center rounded-full bg-gold px-5 font-semibold text-white shadow-lg sm:bottom-6">+ Lead Baru</Link>
          )}
          <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `flex min-h-14 items-center justify-center text-sm ${isActive ? 'font-semibold text-navy' : 'text-stone-500'}`}>{n.label}</NavLink>
            ))}
          </nav>
        </div>
      </ToastProvider>
    </ConfigCtx.Provider>
  );
}
