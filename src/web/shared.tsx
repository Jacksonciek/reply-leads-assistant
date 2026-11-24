// Shared UI helpers: send buttons with "Sudah terkirim?" dialog, chips, toast, formatting.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EventCode } from '../../config/events';
import { clickToSendLink, type LinkFormat } from '../domain/links';
import { getSalam, isProactiveHours, shortWib } from '../domain/time';
import { WA_STATUS_LABEL, type LeadState, type WaStatus } from '../domain/types';

export const EVENT_LABEL: Record<EventCode, string> = { ROADSHOW: 'Roadshow', JESSELTON: 'Jesselton' };

export const INTENT_EN: Record<string, string> = {
  CONFIRM_ATTEND: 'Confirms attendance', PROVIDE_DETAILS: 'Gives attendance details', CHANGE_SCHEDULE: 'Changes schedule',
  DECLINE: 'Cannot attend', OPT_OUT: 'Asks to stop messages', ASK_EVENT_INFO: 'Asks about the event', REQUEST_INFO: 'Asks for info',
  FORGOT_REGISTRATION: 'Forgot registering', ASK_PRODUCT: 'Asks about product (price/unit)', REQUEST_CALL: 'Asks for a call',
  PA_TIME_GIVEN: 'Gives a time for the PA', SOURCE_QUESTION: 'Asks where we got the number', SUSPICIOUS: 'Suspicious / unsure',
  COMPLAINT: 'Complaint', ASK_IF_BOT: 'Asks if this is a bot', SMALL_TALK: 'Small talk', OTHER: 'Other',
  SOFT_ACK: 'Short reply (attendance unclear)', MEDIA: 'Client sent media',
};

/** UI labels. The Indonesian STATE_LABEL stays as-is because it is written to the Status column in Sheets. */
export const STATE_EN: Record<LeadState, string> = { NEW: 'New', REMINDER: 'Reminder', DONE: 'Done' };

export function EventChip({ event }: { event: EventCode }) {
  return (
    <span className={`chip ${event === 'ROADSHOW' ? 'bg-navy-soft text-navy' : 'bg-forest-soft text-forest'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${event === 'ROADSHOW' ? 'bg-navy' : 'bg-forest'}`} />{EVENT_LABEL[event]}
    </span>
  );
}

export function EventDot({ event }: { event: EventCode }) {
  return <span title={EVENT_LABEL[event]} className={`inline-block h-2 w-2 shrink-0 rounded-full ${event === 'ROADSHOW' ? 'bg-navy' : 'bg-forest'}`} />;
}

// A stable colour per client makes rows easy to tell apart at a glance.
const AVATAR_COLORS: [string, string][] = [
  ['#7c6cff', '#5b4cf5'], ['#ff7aa8', '#e9407a'], ['#ffa94d', '#f0670f'], ['#2fd3c0', '#0f9f8f'],
  ['#4cc3ff', '#0ea5e9'], ['#b47cff', '#8b3ff2'], ['#ffcf4d', '#e0a100'], ['#5ee08a', '#16a34a'],
];
/** Initials avatar with a stable per-name colour. */
export function Avatar({ name, event, size = 36 }: { name: string; event: EventCode; size?: number }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return (
    <span title={EVENT_LABEL[event]} style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(140deg, ${c[0]}, ${c[1]})` }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">{ini}</span>
  );
}

const CASE_COLORS: Record<string, string> = {
  X: 'bg-black/[0.05] text-ink-3', WAIT: 'bg-black/[0.04] text-ink-2', DONE: 'bg-emerald-50 text-emerald-800',
  A3: 'bg-orange-50 text-orange-800', A4: 'bg-orange-50 text-orange-800', B6: 'bg-orange-50 text-orange-800'
};
export function CaseChip({ code }: { code: string }) {
  const color = CASE_COLORS[code] ?? (code.includes('R') ? 'bg-orange-50 text-orange-800' : code.includes('H1') ? 'bg-violet-50 text-violet-800' : 'bg-sky-50 text-sky-800');
  return <span className={`chip font-mono text-[11px] ${color}`}>{code}</span>;
}

const STATE_COLORS: Record<LeadState, string> = {
  NEW: 'bg-sky-50 text-sky-800', REMINDER: 'bg-orange-50 text-orange-800', DONE: 'bg-emerald-50 text-emerald-800',
};
export function StateChip({ state }: { state: LeadState }) {
  return <span className={`chip ${STATE_COLORS[state] ?? ''}`}>{STATE_EN[state]}</span>;
}

/** Confirmed = green, bad lead = red (also used to tint rows). */
export const WA_TONE: Record<Exclude<WaStatus, ''>, { chip: string; row: string }> = {
  CONFIRMED: { chip: 'bg-emerald-100 text-emerald-800', row: 'bg-emerald-50/70' },
  BAD_LEAD: { chip: 'bg-red-100 text-red-700', row: 'bg-red-50/70' },
  UNSURE: { chip: 'bg-amber-50 text-amber-800', row: '' },
  NO_REPLY: { chip: 'bg-orange-50 text-orange-800', row: '' },
  NO_WA: { chip: 'bg-black/[0.05] text-ink-3', row: '' },
  CANNOT_ATTEND: { chip: 'bg-slate-100 text-slate-700', row: '' },
};
export function WaChip({ status }: { status: WaStatus }) {
  if (!status) return null;
  return <span className={`chip ${WA_TONE[status].chip}`}>{WA_STATUS_LABEL[status]}</span>;
}

export const fmtTime = (iso: string | null | undefined) => (iso ? shortWib(iso) : '');

/** Re-compute the greeting word at the moment of sending (Section 6.2). */
export function refreshSalam(text: string, now = new Date()): string {
  return text.replace(/^Selamat (pagi|siang|sore|malam)\b/, `Selamat ${getSalam(now)}`);
}

// ---------- toast ----------
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const timer = useRef<number>(undefined);
  const show = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setT({ msg, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), kind === 'err' ? 6000 : 2500);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div role="status" aria-live="polite" key={t.msg + t.kind} className={`animate-sheet fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-[14px] text-white shadow-[0_10px_30px_rgba(0,0,0,0.2)] sm:bottom-6 ${t.kind === 'err' ? 'bg-red-700' : 'bg-ink/95'}`} onClick={() => setT(null)}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.kind === 'err' ? 'bg-white' : 'bg-emerald-400'}`} />{t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- read-only (/user) mode ----------
/** readOnly: the /user pages (view and copy only). base: prefix for in-app links ('' or '/user'). */
export const ViewCtx = createContext<{ readOnly: boolean; base: string }>({ readOnly: false, base: '' });
export const useView = () => useContext(ViewCtx);

// ---------- send actions ----------
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

interface SendProps {
  phone: string;
  text: string;
  proactive?: boolean;
  linkFormat: LinkFormat;
  disabled?: boolean;
  /** Called with the final text when Jackson confirms the message was sent. */
  onSent: (finalText: string) => Promise<void> | void;
  compact?: boolean;
}

export function SendActions({ phone, text, proactive, linkFormat, disabled, onSent, compact }: SendProps) {
  const toast = useToast();
  const { readOnly } = useView();
  const [ask, setAsk] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible' && pending.current) { setAsk(pending.current); pending.current = null; } };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, []);

  const guardHours = () => !proactive || isProactiveHours(new Date())
    || window.confirm('It is outside 09:00–20:00 WIB. A proactive message may disturb the client. Open WhatsApp anyway?');

  const open = () => {
    if (!guardHours()) return;
    const final = refreshSalam(text);
    const link = clickToSendLink(phone, final, linkFormat);
    pending.current = final;
    if (linkFormat === 'android_business') window.location.href = link;
    else window.open(link, '_blank', 'noopener');
    // Desktop browsers may not blur: offer the dialog after a moment anyway.
    window.setTimeout(() => { if (pending.current && document.visibilityState === 'visible') { setAsk(pending.current); pending.current = null; } }, 4000);
  };
  const copy = async () => {
    const final = refreshSalam(text);
    if (await copyText(final)) { toast('Copied'); pending.current = final; } else toast('Could not copy', 'err');
  };
  const confirmSent = async (final: string) => {
    setBusy(true);
    try { await onSent(final); setAsk(null); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };

  if (readOnly) {
    return (
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-3'}`}>
        <button className="btn-ghost" disabled={disabled} onClick={async () => toast(await copyText(refreshSalam(text)) ? 'Copied' : 'Could not copy', 'ok')}>Copy</button>
      </div>
    );
  }

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-3'}`}>
        <button className="btn-wa flex-1" disabled={disabled || !phone} onClick={open}>Open WhatsApp</button>
        <button className="btn-ghost" disabled={disabled} onClick={copy}>Copy</button>
        <button className="btn-ghost" disabled={disabled || busy} onClick={() => setAsk(refreshSalam(text))}>Mark as sent</button>
      </div>
      {ask !== null && (
        <Modal onClose={() => setAsk(null)} title="Was it sent?">
          <p className="text-sm text-ink-2">Once you have sent it from WhatsApp, it will be recorded in this conversation.</p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={() => confirmSent(ask)}>Yes, it was sent</button>
            <button className="btn-ghost" onClick={() => setAsk(null)}>Not yet</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="animate-fade fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="animate-sheet w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:rounded-2xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-[17px] font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3 p-1" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-6 w-40" /><div className="skeleton h-20 w-full" /><div className="skeleton h-20 w-full" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <span className="flex-1">{error}</span>
      {onRetry && <button className="btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul className="mt-2 space-y-1">{items.map((w) => <li key={w} className="rounded-lg border border-amber-200/70 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{w}</li>)}</ul>;
}
