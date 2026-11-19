// Shared UI helpers: send buttons with "Sudah terkirim?" dialog, chips, toast, formatting.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EventCode } from '../../config/events';
import { clickToSendLink, type LinkFormat } from '../domain/links';
import { getSalam, isProactiveHours, shortWib } from '../domain/time';
import { STATE_LABEL, type LeadState } from '../domain/types';

export const EVENT_LABEL: Record<EventCode, string> = { ROADSHOW: 'Roadshow', JESSELTON: 'Jesselton' };

export function EventChip({ event }: { event: EventCode }) {
  return <span className={`chip ${event === 'ROADSHOW' ? 'bg-navy-soft text-navy' : 'bg-forest-soft text-forest'}`}>{EVENT_LABEL[event]}</span>;
}

const CASE_COLORS: Record<string, string> = {
  X: 'bg-stone-200 text-stone-600', CONV: 'bg-amber-100 text-amber-800', WAIT: 'bg-stone-100 text-stone-600', DONE: 'bg-emerald-100 text-emerald-800',
};
export function CaseChip({ code }: { code: string }) {
  const color = CASE_COLORS[code] ?? (code.includes('R') ? 'bg-orange-100 text-orange-800' : code.includes('H1') ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800');
  return <span className={`chip ${color}`}>{code}</span>;
}

const STATE_COLORS: Partial<Record<LeadState, string>> = {
  NEW: 'bg-sky-100 text-sky-800', AWAITING_REPLY: 'bg-orange-100 text-orange-800', REPLIED: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800', DECLINED: 'bg-stone-200 text-stone-700', OPTED_OUT: 'bg-red-100 text-red-700', NO_WHATSAPP: 'bg-stone-200 text-stone-600',
};
export function StateChip({ state }: { state: LeadState }) {
  return <span className={`chip ${STATE_COLORS[state] ?? ''}`}>{STATE_LABEL[state]}</span>;
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
        <div className={`fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.kind === 'err' ? 'bg-red-700' : 'bg-stone-900'}`} onClick={() => setT(null)}>
          {t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

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
    || window.confirm('Sekarang di luar jam 09.00–20.00 WIB. Pesan proaktif bisa mengganggu waktu istirahat klien. Tetap buka WhatsApp?');

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
    if (await copyText(final)) { toast('Teks disalin'); pending.current = final; } else toast('Gagal menyalin', 'err');
  };
  const confirmSent = async (final: string) => {
    setBusy(true);
    try { await onSent(final); setAsk(null); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-3'}`}>
        <button className="btn-wa flex-1" disabled={disabled || !phone} onClick={open}>Buka WhatsApp</button>
        <button className="btn-ghost" disabled={disabled} onClick={copy}>Salin teks</button>
        <button className="btn-ghost" disabled={disabled || busy} onClick={() => setAsk(refreshSalam(text))}>Tandai terkirim</button>
      </div>
      {ask !== null && (
        <Modal onClose={() => setAsk(null)} title="Sudah terkirim?">
          <p className="text-sm text-stone-600">Bila pesan sudah Anda kirim dari WhatsApp, pesan akan dicatat di room.</p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={() => confirmSent(ask)}>Ya, sudah terkirim</button>
            <button className="btn-ghost" onClick={() => setAsk(null)}>Belum</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-base font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return <div className="p-6 text-center text-sm text-stone-500">Memuat…</div>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card border-red-200 bg-red-50 text-sm text-red-800">
      {error}
      {onRetry && <button className="btn-ghost ml-2 mt-2" onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul className="mt-2 space-y-1">{items.map((w) => <li key={w} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">⚠ {w}</li>)}</ul>;
}
