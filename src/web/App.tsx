import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { Loading, ToastProvider } from './shared';
import { HomePage } from './pages/Home';
import { LeadsPage, Workspace } from './pages/Leads';
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
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="animate-rise w-full max-w-[340px]">
        <Mark />
        <h1 className="mt-5 text-[22px] font-semibold">Sign in</h1>
        <p className="mb-6 text-sm text-ink-3">WhatsApp reply assistant for Roadshow &amp; Jesselton.</p>
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
        {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary mt-4 w-full" disabled={busy || !pw}>{busy ? 'Checking…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function Mark() {
  return <span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-ink text-[13px] font-semibold tracking-tight text-white">Z</span>;
}

const NAV = [
  { to: '/', label: 'Today' },
  { to: '/leads', label: 'Leads' },
  { to: '/bulk', label: 'Bulk' },
  { to: '/more', label: 'More' },
];

function MorePage({ authRequired }: { authRequired: boolean }) {
  const items = [
    ['/import', 'Import Excel', 'Add many leads from a Bitrix24 file'], ['/templates', 'Templates', 'Message text per event'],
    ['/knowledge', 'Knowledge', 'Answers the AI is allowed to use'], ['/settings', 'Settings', 'AI model, Google Sheets, link format'],
  ];
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-[26px] font-semibold">More</h1>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map(([to, label, hint]) => (
          <Link key={to} to={to} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-canvas">
            <span className="flex-1"><span className="block text-[15px] font-medium">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
            <span aria-hidden className="text-ink-3">›</span>
          </Link>
        ))}
      </div>
      {authRequired && <button className="btn-ghost w-full" onClick={async () => { await api('/api/auth/logout', { body: {} }); nav('/'); window.location.reload(); }}>Sign out</button>}
    </div>
  );
}

const isWorkspace = (p: string) => p.startsWith('/room/');

export function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [authRequired, setAuthRequired] = useState(true);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const loc = useLocation();

  const reload = useCallback(() => { api<AppConfig>('/api/config').then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    api<{ authenticated: boolean; auth_required?: boolean }>('/api/auth/me')
      .then((r) => { setAuthRequired(r.auth_required !== false); setAuth(r.authenticated); })
      .catch(() => setAuth(false));
  }, []);
  useEffect(() => { if (auth) reload(); }, [auth, reload]);
  useEffect(() => {
    const h = () => setAuth(false);
    window.addEventListener('unauthorized', h);
    return () => window.removeEventListener('unauthorized', h);
  }, []);

  if (auth === null) return <div className="mx-auto max-w-3xl p-6"><Loading /></div>;
  if (!auth) return <Login onDone={() => setAuth(true)} />;

  const ws = isWorkspace(loc.pathname);
  const inRoom = loc.pathname.startsWith('/room/');
  const navActive = (to: string) => (to === '/leads' ? ws || loc.pathname === '/leads' : to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));

  return (
    <ConfigCtx.Provider value={{ cfg, reload }}>
      <ToastProvider>
        <div className="flex min-h-dvh flex-col">
          <header className={`glass sticky top-0 z-30 border-b border-black/[0.06] ${inRoom ? 'hidden md:block' : ''}`}>
            <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
              <Link to="/" className="flex items-center gap-2.5"><Mark /><span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Replies</span></Link>
              <nav className="ml-2 hidden sm:block">
                <div className="segmented">
                  {NAV.map((n) => <Link key={n.to} to={n.to} className={`seg ${navActive(n.to) ? 'seg-on' : ''}`}>{n.label}</Link>)}
                </div>
              </nav>
              <span className="flex-1" />
              {loc.pathname !== '/leads/new' && <Link to="/leads/new" className="btn-primary h-9 min-h-9"><span aria-hidden className="-ml-0.5 text-[17px] leading-none">+</span>New lead</Link>}
            </div>
          </header>
          {ws ? (
            <Routes>
              <Route element={<Workspace />}>
                <Route path="/room/:id" element={<RoomPage />} />
              </Route>
            </Routes>
          ) : (
            <main key={loc.pathname} className="animate-rise mx-auto w-full max-w-[1200px] flex-1 px-4 pb-28 pt-6 sm:pb-12">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/bulk" element={<BulkPage />} />
                <Route path="/leads/new" element={<NewLeadPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/knowledge" element={<FaqPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/more" element={<MorePage authRequired={authRequired} />} />
                <Route path="*" element={<p className="text-sm">Page not found. <Link className="text-accent" to="/">Go back</Link></p>} />
              </Routes>
            </main>
          )}
          {!inRoom && (
            <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-black/[0.06] pb-[env(safe-area-inset-bottom)] sm:hidden">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={`flex min-h-14 items-center justify-center text-[13px] transition-colors ${navActive(n.to) ? 'font-semibold text-accent' : 'text-ink-3'}`}>{n.label}</NavLink>
              ))}
            </nav>
          )}
        </div>
      </ToastProvider>
    </ConfigCtx.Provider>
  );
}
