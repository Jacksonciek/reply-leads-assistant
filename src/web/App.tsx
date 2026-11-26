import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { Loading, ToastProvider, ViewCtx } from './shared';
import { HomePage } from './pages/Home';
import { LeadsPage, Workspace } from './pages/Leads';
import { NewLeadPage } from './pages/NewLead';
import { RoomPage } from './pages/Room';
import { ImportPage } from './pages/Import';
import { TemplatesPage } from './pages/Templates';
import { FaqPage } from './pages/Faq';
import { SettingsPage } from './pages/Settings';

export interface AppConfig { config: Record<string, string>; env: { GEMINI_MODEL: string; GEMINI_FALLBACK_MODEL: string; store: string; gemini_configured: boolean } }
const ConfigCtx = createContext<{ cfg: AppConfig | null; reload: () => void }>({ cfg: null, reload: () => {} });
export const useConfig = () => useContext(ConfigCtx);

type Role = 'admin' | 'user';

function Login({ onDone }: { onDone: (role: Role) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { const r = await api<{ role: Role }>('/api/auth/login', { body: { password: pw } }); onDone(r.role); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
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
  { to: '/', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/templates', label: 'Template' },
  { to: '/more', label: 'Settings' },
];

function MorePage({ authRequired }: { authRequired: boolean }) {
  const items = [
    ['/settings', 'Adjustments', 'AI model, event names, link format'], ['/import', 'Import Excel', 'Add or update leads from the Bitrix24 file'],
    ['/knowledge', 'Knowledge', 'Answers the AI is allowed to use'],
  ];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-[26px] font-semibold">Settings</h1>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map(([to, label, hint]) => (
          <Link key={to} to={to} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-canvas">
            <span className="flex-1"><span className="block text-[15px] font-medium">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
            <span aria-hidden className="text-ink-3">›</span>
          </Link>
        ))}
      </div>
      {authRequired && <button className="btn-ghost w-full" onClick={signOut}>Sign out</button>}
    </div>
  );
}

const isWorkspace = (p: string) => p.startsWith('/room/');

const signOut = async () => { await api('/api/auth/logout', { body: {} }); window.location.href = '/'; };

/** /user: the user role. View, search and copy only (dashboard, leads, chats). No templates, settings or editing. */
function ViewerApp({ canSignOut }: { canSignOut: boolean }) {
  const loc = useLocation();
  const ws = loc.pathname.startsWith('/user/room/');
  const nav = [{ to: '/user', label: 'Dashboard' }, { to: '/user/leads', label: 'Leads' }];
  const active = (to: string) => (to === '/user' ? loc.pathname === '/user' : loc.pathname === '/user/leads' || ws);
  return (
    <ViewCtx.Provider value={{ readOnly: true, base: '/user' }}>
      <ToastProvider>
        <div className={`flex flex-col ${ws ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
          <header className={`glass sticky top-0 z-30 border-b border-black/[0.06] ${ws ? 'hidden md:block' : ''}`}>
            <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:gap-4">
              <Link to="/user" className="flex shrink-0 items-center gap-2.5"><Mark /><span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Replies</span></Link>
              <nav className="min-w-0 sm:ml-2"><div className="segmented">
                {nav.map((n) => <Link key={n.to} to={n.to} className={`seg px-2.5 sm:px-3 ${active(n.to) ? 'seg-on' : ''}`}>{n.label}</Link>)}
              </div></nav>
              <span className="flex-1" />
              <span className="chip hidden bg-black/[0.05] text-ink-3 sm:inline-flex">View only</span>
              {canSignOut && <button className="btn-ghost h-9 min-h-9 shrink-0 px-3" onClick={signOut}>Sign out</button>}
            </div>
          </header>
          {ws ? (
            <Routes><Route element={<Workspace />}><Route path="/user/room/:id" element={<RoomPage />} /></Route></Routes>
          ) : (
            <main key={loc.pathname} className="animate-rise mx-auto w-full max-w-[1200px] flex-1 px-4 pb-12 pt-6">
              <Routes>
                <Route path="/user" element={<HomePage />} />
                <Route path="/user/leads" element={<LeadsPage />} />
                <Route path="*" element={<p className="text-sm">Page not found. <Link className="text-accent" to="/user">Go back</Link></p>} />
              </Routes>
            </main>
          )}
        </div>
      </ToastProvider>
    </ViewCtx.Provider>
  );
}

export function App() {
  const loc = useLocation();
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [authRequired, setAuthRequired] = useState(true);
  useEffect(() => {
    api<{ authenticated: boolean; role?: Role | null; auth_required?: boolean }>('/api/auth/me')
      .then((r) => { setAuthRequired(r.auth_required !== false); setRole(r.authenticated ? (r.role ?? 'admin') : null); })
      .catch(() => setRole(null));
  }, []);
  useEffect(() => {
    const h = () => setRole(null);
    window.addEventListener('unauthorized', h);
    return () => window.removeEventListener('unauthorized', h);
  }, []);

  if (role === undefined) return <div className="mx-auto max-w-3xl p-6"><Loading /></div>;
  if (!role) return <Login onDone={setRole} />;
  const inUser = loc.pathname === '/user' || loc.pathname.startsWith('/user/');
  if (role === 'user') {
    if (!inUser) return <Navigate to={loc.pathname.startsWith('/room/') ? `/user${loc.pathname}` : '/user'} replace />;
    return <ViewerApp canSignOut={authRequired} />;
  }
  return inUser ? <ViewerApp canSignOut={authRequired} /> : <AdminApp authRequired={authRequired} />;
}

function AdminApp({ authRequired }: { authRequired: boolean }) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const loc = useLocation();

  const reload = useCallback(() => { api<AppConfig>('/api/config').then(setCfg).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [reload]);

  const ws = isWorkspace(loc.pathname);
  const inRoom = loc.pathname.startsWith('/room/');
  const navActive = (to: string) => (to === '/leads' ? ws || loc.pathname === '/leads' : to === '/' ? loc.pathname === '/'
    : to === '/more' ? ['/more', '/settings', '/import', '/knowledge'].includes(loc.pathname) : loc.pathname.startsWith(to));

  return (
    <ConfigCtx.Provider value={{ cfg, reload }}>
      <ToastProvider>
        <div className={`flex flex-col ${ws ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
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
