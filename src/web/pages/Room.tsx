import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { sessionInfo } from '../../../config/events';
import type { LeadView } from '../../domain/dashboard';
import { flagLabel } from '../../domain/guardrails';
import type { LinkFormat } from '../../domain/links';
import type { InviteMessage, NextMessage } from '../../domain/next-message';
import { parseWaPaste, type PastedMessage } from '../../domain/parse-wa-paste';
import type { AnyIntent } from '../../domain/routing';
import { DATE_OPTIONS } from '../../domain/sheet-row';
import { getSalam } from '../../domain/time';
import { guestsLabel, WA_STATUS_LABEL, type Draft, type LeadState, type Message } from '../../domain/types';
import { useConfig } from '../App';
import { api } from '../api';
import {
  Avatar, CaseChip, copyText, INTENT_EN, STATE_EN, ErrorBox, EventChip, fmtTime, Loading, Modal, SendActions, StateChip, useToast, useView, WaChip, Warnings,
} from '../shared';
import type { WorkspaceCtx } from './Leads';

interface RoomData {
  lead: LeadView; messages: Message[]; draft: Draft | null; next: NextMessage; contact_name: string;
  also_registered: string[]; link_format: LinkFormat; poster: string; invite: InviteMessage | null;
}

const DATES = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const QUICK: Record<string, string[]> = {
  ROADSHOW: ['A3', 'A4', 'KONF-A', 'HANDOFF_PA', 'CALL_REQUEST', 'PA_TIME_ACK', 'HOLD', 'SOURCE', 'DECLINE', 'OPT_OUT', 'A1', 'A2', 'POSTER-A'],
  JESSELTON: ['B6', 'B-R', 'B-H1', 'KONF-B', 'HANDOFF_PA', 'CALL_REQUEST', 'PA_TIME_ACK', 'HOLD', 'SOURCE', 'DECLINE', 'OPT_OUT', 'B4', 'B5', 'POSTER-B'],
};
const SOURCE_LABEL: Record<string, string> = { PASTED: 'pasted', TEMPLATE: 'template', LLM_DRAFT: 'AI draft', EDITED_DRAFT: 'edited draft', MANUAL: 'manual', WHATSAPP: '' };
// Hints are passed to the model as instructions; the reply itself stays in Indonesian.
const INSTRUCTION_HINTS = ['Shorter', 'More formal', 'More casual', 'Less salesy', 'Only answer the question', 'Invite them to attend in person'];

type Patch = (b: Record<string, unknown>, m?: string) => Promise<void>;

export function RoomPage() {
  const { base, readOnly } = useView();
  const { id } = useParams();
  const { refreshList } = useOutletContext<WorkspaceCtx>();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const [d, setD] = useState<RoomData | null>(null);
  const [err, setErr] = useState('');
  const [generating, setGenerating] = useState(false);
  const [details, setDetails] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try { setD(await api<RoomData>(`/api/leads/${id}`)); } catch (e) { setErr((e as Error).message); }
  }, [id]);
  // Changes in the room also change the sidebar preview.
  const reload = useCallback(async () => { await load(); refreshList(); }, [load, refreshList]);
  useEffect(() => { setD(null); setDetails(false); load(); }, [load]);

  const generate = useCallback(async (instruction?: string) => {
    setGenerating(true);
    try { await api(`/api/leads/${id}/generate`, { body: { instruction } }); await load(); } catch (e) { toast((e as Error).message, 'err'); } finally { setGenerating(false); }
  }, [id, load, toast]);

  useEffect(() => {
    if (sp.get('generate') === '1' && d) { setSp({}, { replace: true }); generate(); }
  }, [sp, d, generate, setSp]);

  if (err) return <div className="p-4"><ErrorBox error={err} onRetry={load} /></div>;
  if (!d) return <div className="p-4"><Loading /></div>;
  const { lead } = d;

  const patch: Patch = async (body, msg = 'Saved') => {
    try { await api(`/api/leads/${lead.lead_id}`, { method: 'PATCH', body }); toast(msg); await reload(); } catch (e) { toast((e as Error).message, 'err'); }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="glass z-20 flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] px-3 md:static">
        <Link to={`${base}/leads`} className="btn-quiet -ml-1 h-9 min-h-9 px-2 md:hidden" aria-label="Back to leads">‹ Leads</Link>
        <Avatar name={lead.call_name || lead.full_name} event={lead.event} size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-semibold">{lead.gender || 'Bapak/Ibu'} {lead.call_name || lead.full_name}</div>
          <div className="truncate text-xs text-ink-3">{lead.event === 'ROADSHOW' ? 'Roadshow' : 'Jesselton'}{lead.phone_e164 && ` · +${lead.phone_e164}`}</div>
        </div>
        <WaChip status={lead.wa_status} />
        {lead.needs_attention && <span className="chip hidden bg-red-50 text-red-700 sm:inline-flex">Needs attention</span>}
        <button className="btn-quiet h-9 min-h-9 px-2.5" title={d.contact_name} onClick={async () => { await copyText(d.contact_name); toast(`Copied: ${d.contact_name}`); }}>Copy WA name</button>
        <button className={`btn-quiet h-9 min-h-9 xl:hidden ${details ? 'bg-black/[0.06] text-ink' : ''}`} onClick={() => setDetails((x) => !x)} aria-expanded={details}>Details</button>
      </header>
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Timeline d={d} reload={reload} generate={generate} generating={generating} />
          {!readOnly && <Composer d={d} reload={reload} generate={generate} generating={generating} />}
        </div>
        {details && <div className="animate-fade fixed inset-0 z-30 bg-black/20 xl:hidden" onClick={() => setDetails(false)} />}
        <aside className={`${details ? 'animate-sheet fixed inset-y-0 right-0 z-40 flex w-[min(360px,92vw)] shadow-[0_0_40px_rgba(0,0,0,0.15)]' : 'hidden'} flex-col overflow-y-auto border-l border-line bg-surface xl:static xl:z-auto xl:flex xl:w-[320px] xl:shadow-none`}>
          <div className="flex items-center justify-between px-4 pt-4 xl:hidden">
            <span className="eyebrow">Lead details</span>
            <button className="btn-quiet h-8 min-h-8 px-2" onClick={() => setDetails(false)}>Close</button>
          </div>
          <Profile d={d} patch={patch} />
          <Actions d={d} patch={patch} />
        </aside>
      </div>
    </div>
  );
}

// ---------- timeline ----------

function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Timeline({ d, reload, generate, generating }: { d: RoomData; reload: () => Promise<void>; generate: (i?: string) => Promise<void>; generating: boolean }) {
  const toast = useToast();
  const { readOnly } = useView();
  const [editing, setEditing] = useState<Message | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const key = `${d.messages.length}:${d.draft?.draft_id ?? ''}:${generating}`;
  useLayoutEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [key]);

  let lastDay = '';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-[720px] space-y-1.5">
        {!d.messages.length && (
          <div className="py-10 text-center">
            <p className="text-[15px] font-medium">No messages yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-3">
              {d.lead.state === 'NEW' ? 'Start with the first message below, or paste the client reply.' : 'Copy the reminder below, or paste the latest chat from WhatsApp.'}
            </p>
          </div>
        )}
        {d.messages.map((m, i) => {
          const day = dayLabel(m.sent_at);
          const showDay = day !== lastDay; lastDay = day;
          const out = m.direction === 'OUT';
          // App messages from before the WhatsApp copy starts are no longer in WhatsApp (disappearing messages).
          const waStart = m.source === 'WHATSAPP' && i > 0 && d.messages[i - 1].source !== 'WHATSAPP';
          const archiveStart = i === 0 && m.source !== 'WHATSAPP' && d.messages.some((x) => x.source === 'WHATSAPP');
          return (
            <div key={m.msg_id}>
              {archiveStart && <p className="pb-1 text-center text-[11.5px] text-ink-3">Arsip: pesan lama yang sudah tidak ada di WhatsApp</p>}
              {waStart && <p className="py-2 text-center text-[11.5px] text-ink-3">— Mulai dari sini sama dengan WhatsApp —</p>}
              {showDay &&<div className="py-3 text-center"><span className="eyebrow rounded-lg bg-white px-2.5 py-1 normal-case tracking-normal shadow-sm">{day}</span></div>}
              <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <button onClick={() => !readOnly && setEditing(m)} title={readOnly ? undefined : "Edit or delete message"}
                  className={`group max-w-[82%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-left text-[14.5px] leading-[1.45] transition-transform duration-100 active:scale-[0.99] ${out ? 'rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-white'} shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]`}>
                  {m.text}
                  <span className={`mt-1 flex items-center justify-end gap-1.5 text-[10.5px] text-ink-3`}>
                    {out ? <>{SOURCE_LABEL[m.source] ?? m.source}{m.template_code && ` · ${m.template_code}`}</> : null}
                    {out && <span className="text-sky-500">✓✓</span>}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
        <DraftCard d={d} reload={reload} generate={generate} generating={generating} />
        <div ref={end} className="h-1" />
      </div>
      {editing && <EditMessage m={editing} onClose={() => setEditing(null)} onDone={async (msg) => { setEditing(null); toast(msg); await reload(); }} />}
    </div>
  );
}

function EditMessage({ m, onClose, onDone }: { m: Message; onClose: () => void; onDone: (msg: string) => void }) {
  const toast = useToast();
  const [text, setText] = useState(m.text);
  const [dir, setDir] = useState(m.direction);
  const save = async () => {
    try { await api(`/api/messages/${m.msg_id}`, { method: 'PATCH', body: { text, direction: dir } }); onDone('Message updated'); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const del = async () => {
    if (!window.confirm('Delete this message from the conversation?')) return;
    try { await api(`/api/messages/${m.msg_id}`, { method: 'DELETE' }); onDone('Message deleted'); } catch (e) { toast((e as Error).message, 'err'); }
  };
  return (
    <Modal title="Edit message" onClose={onClose}>
      <textarea className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="segmented mt-3 flex">
        <button className={`seg flex-1 ${dir === 'IN' ? 'seg-on' : ''}`} onClick={() => setDir('IN')}>From client</button>
        <button className={`seg flex-1 ${dir === 'OUT' ? 'seg-on' : ''}`} onClick={() => setDir('OUT')}>From me</button>
      </div>
      <div className="mt-4 flex gap-2"><button className="btn-primary flex-1" onClick={save}>Save</button><button className="btn-danger" onClick={del}>Delete</button></div>
    </Modal>
  );
}

/** The pending reply lives at the end of the conversation, where it will land once sent. */
function DraftCard({ d, reload, generate, generating }: { d: RoomData; reload: () => Promise<void>; generate: (i?: string) => Promise<void>; generating: boolean }) {
  const { lead, next, draft } = d;
  const toast = useToast();
  const { readOnly } = useView();
  const lastIsIn = lead.room.last_dir === 'IN';
  const [text, setText] = useState('');
  const [code, setCode] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  // The ready message (first message / reminder) stays visible even when the client wrote last.
  // Jesselton reminders come only from the invitation templates (JC-INV / JC-FIX, see InviteCard).
  const oldJcReminder = lead.event === 'JESSELTON' && lead.state !== 'NEW';
  const mode: 'draft' | 'template' | 'none' = draft ? 'draft' : next.template_code && !oldJcReminder ? 'template' : 'none';
  useEffect(() => {
    if (draft) { setText(draft.draft_text); setCode(draft.template_code || undefined); }
    else if (mode === 'template') { setText(next.text ?? ''); setCode(next.template_code ?? undefined); }
    else { setText(''); setCode(undefined); }
  }, [draft?.draft_id, next.text, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 420)}px`; } }, [text]);

  // Quick-insert lives in the composer; it hands text over through this event.
  useEffect(() => {
    const h = (e: Event) => { const { text: t, code: c } = (e as CustomEvent).detail; setText(t); setCode(c); };
    window.addEventListener('room:insert', h);
    return () => window.removeEventListener('room:insert', h);
  }, []);

  // View-only: the ready message (reminder / invitation / pending draft) can be read and copied, nothing else.
  if (readOnly) {
    if (mode === 'none' && oldJcReminder && d.invite) return <InviteCard d={d} invite={d.invite} reload={reload} />;
    if (!text) return null;
    return (
      <div className="flex justify-end pt-2">
        <div className="w-full max-w-[560px] rounded-lg rounded-tr-sm border border-dashed border-emerald-500/60 bg-[#f3fdf1] p-3">
          <span className="chip bg-accent-soft text-accent">{mode === 'draft' ? 'Draft · not sent' : 'Ready to copy'}</span>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ink-2 p-3 text-[14.5px] text-white leading-[1.5]">{text}</p>
          <SendActions phone={lead.phone_e164} text={text} linkFormat={d.link_format} onSent={() => {}} />
        </div>
      </div>
    );
  }
  if (generating) {
    return (
      <div className="flex justify-end pt-2" aria-live="polite">
        <div className="w-[min(82%,520px)] space-y-2 rounded-lg rounded-tr-sm border border-dashed border-emerald-500/60 bg-[#f3fdf1] p-4">
          <span className="eyebrow text-accent">Writing draft…</span>
          <div className="skeleton h-3 w-11/12" /><div className="skeleton h-3 w-9/12" /><div className="skeleton h-3 w-10/12" />
        </div>
      </div>
    );
  }
  if (mode === 'none' && !text && oldJcReminder && d.invite) {
    return (
      <>
        {lastIsIn && <div className="flex justify-center pt-4"><button className="btn-accent" onClick={() => generate()}>Draft a reply to the client</button></div>}
        <InviteCard d={d} invite={d.invite} reload={reload} />
      </>
    );
  }
  if (mode === 'none' && !text) {
    if (!lastIsIn) {
      const why = oldJcReminder ? null : next.error ?? next.case.reason;
      return why ? <p className="pt-4 text-center text-xs text-ink-3">{why}</p> : null;
    }
    return (
      <div className="flex justify-center pt-4">
        <button className="btn-accent" onClick={() => generate()}>Draft a reply</button>
      </div>
    );
  }

  const flags = draft?.flags ? draft.flags.split('|').filter(Boolean) : [];
  const notes = flags.filter((f) => f.startsWith('note:')).map((f) => f.slice(5));
  const guard = flags.filter((f) => f.startsWith('guardrail:')).map((f) => flagLabel(f.slice(10)));
  const suggestion = draft?.suggestion_json ? JSON.parse(draft.suggestion_json) as Record<string, unknown> : {};
  const extracted = draft?.extracted_json ? Object.entries(JSON.parse(draft.extracted_json) as Record<string, unknown>).filter(([, v]) => v != null && v !== '') : [];
  const dirty = !!draft && text !== draft.draft_text;
  const posterCode = code?.startsWith('POSTER') || flags.includes('attach_poster') || (mode === 'template' && lead.state === 'NEW');
  const label = mode !== 'template' ? 'Draft · not sent' : lead.state === 'NEW' ? 'First message · not sent'
    : next.case.due ? 'Reminder · ready to copy' : 'Reminder · already sent this round';

  const markSent = async (final: string) => {
    await api(`/api/leads/${lead.lead_id}/mark-sent`, { body: { text: final, template_code: draft ? undefined : code, draft_id: draft?.draft_id } });
    toast('Recorded as sent');
    await reload();
  };
  const saveDraft = async () => {
    setSaving(true);
    try { await api(`/api/drafts/${draft!.draft_id}`, { method: 'PATCH', body: { draft_text: text } }); toast('Draft saved'); await reload(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setSaving(false); }
  };
  const applySuggestion = async () => {
    try { await api(`/api/leads/${lead.lead_id}/apply-suggestion`, { body: { draft_id: draft!.draft_id } }); toast('Suggestion applied'); await reload(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const discard = async () => {
    try { await api(`/api/drafts/${draft!.draft_id}/discard`, { body: {} }); toast('Draft discarded'); await reload(); } catch (e) { toast((e as Error).message, 'err'); }
  };

  return (
    <>
    {lastIsIn && !draft && (
      <div className="flex justify-center pt-4">
        <button className="btn-accent" onClick={() => generate()}>Draft a reply to the client</button>
      </div>
    )}
    <div className="flex justify-end pt-2">
      <div className="animate-rise w-full max-w-[560px] rounded-lg rounded-tr-sm border border-dashed border-emerald-500/60 bg-[#f3fdf1] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className={`chip ${mode === 'template' && !next.case.due && lead.state !== 'NEW' ? 'bg-black/[0.05] text-ink-2' : 'bg-accent-soft text-accent'}`}>{label}</span>
          {draft && <span className="chip bg-black/[0.04] text-ink-2">{draft.draft_source === 'LLM' ? 'AI' : draft.draft_source === 'TEMPLATE' ? 'Template' : draft.draft_source === 'FIXED' ? 'Fixed' : 'Manual'}</span>}
          {code && <CaseChip code={code} />}
          {dirty && <span className="chip bg-amber-50 text-amber-800">Unsaved</span>}
          {mode === 'template' && next.cross_event && <span className="text-xs text-ink-3">CROSS_EVENT variant</span>}
        </div>
        {mode === 'template' && <Warnings items={next.warnings} />}
        {mode === 'template' && next.error && <ErrorBox error={next.error} />}
        {draft && (draft.reason || draft.instruction || extracted.length > 0 || notes.length > 0 || guard.length > 0) && (
          <div className="mb-2 space-y-1 px-1 text-[12.5px] text-ink-2">
            <div><span className="font-medium text-ink">{INTENT_EN[draft.intent as AnyIntent] ?? draft.intent}</span>{draft.confidence && Number(draft.confidence) < 1 && <span className="text-ink-3"> · {Math.round(Number(draft.confidence) * 100)}% sure</span>}{draft.reason && <span className="text-ink-3"> · {draft.reason}</span>}</div>
            {draft.instruction && <div className="text-ink-3">Instruction: “{draft.instruction}”</div>}
            {extracted.length > 0 && <div className="text-ink-3">Detected: {extracted.map(([k, v]) => `${k}=${v}`).join(', ')}</div>}
            {notes.map((n) => <div key={n} className="text-sky-800">{n}</div>)}
            {guard.length > 0 && <div className="text-red-700">Guardrail: {guard.join(', ')}</div>}
            {draft.original_text && <details><summary className="cursor-pointer text-red-700">Show original draft (rejected)</summary><p className="mt-1 whitespace-pre-wrap">{draft.original_text}</p></details>}
            {notes.some((n) => n.includes('FAQ')) && <Link className="text-accent" to="/knowledge">Add to Knowledge</Link>}
          </div>
        )}
        {draft?.draft_source === 'NONE' && !text && <p className="px-1 pb-2 text-sm text-ink-2">No reply needed. You can still write one yourself.</p>}
        <textarea ref={ta} aria-label="Reply text" className="input min-h-28 resize-none border-transparent bg-ink-2 text-[14.5px] leading-[1.5] text-white caret-[#d4af37] placeholder:text-white/50 focus:border-[#d4af37]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" />
        {posterCode && (
          <div className="mt-2 rounded-xl bg-gold-soft px-3 py-2 text-xs text-gold">
            Send the poster image first, with this text as its caption. <a className="font-medium underline" href={d.poster} download>Download poster</a>
          </div>
        )}
        {Object.keys(suggestion).length > 0 && (
          <button className="btn-ghost mt-2 w-full justify-start text-left" onClick={applySuggestion}>
            <span className="text-ink-3">Apply to lead:</span> {Object.entries(suggestion).map(([k, v]) => k === 'state' ? STATE_EN[v as LeadState] : `${k}=${v}`).join(', ')}
          </button>
        )}
        <SendActions phone={lead.phone_e164} text={text} proactive={mode === 'template'} linkFormat={d.link_format} disabled={!text.trim()} onSent={markSent} />
        {draft && (
          <div className="mt-1.5 flex gap-1">
            <button className="btn-quiet h-9 min-h-9" disabled={!dirty || saving} onClick={saveDraft}>{saving ? 'Saving…' : 'Save draft'}</button>
            <span className="flex-1" />
            <button className="btn-quiet h-9 min-h-9 text-ink-3" onClick={discard}>Discard</button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/** Jesselton invitation at the end of the chat: message 1 → video → message 2, each sent on its own. */
function InviteCard({ d, invite, reload }: { d: RoomData; invite: InviteMessage; reload: () => Promise<void> }) {
  const toast = useToast();
  const markSent = (code: string) => async (final: string) => {
    await api(`/api/leads/${d.lead.lead_id}/mark-sent`, { body: { text: final, template_code: code } });
    toast('Recorded as sent');
    await reload();
  };
  return (
    <div className="flex justify-end pt-2">
      <div className="animate-rise w-full max-w-[560px] space-y-3 rounded-lg rounded-tr-sm border border-dashed border-emerald-500/60 bg-[#f3fdf1] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <span className="chip bg-accent-soft text-accent">{invite.codes[0] === 'JC-FIX-1' ? 'Reminder sudah fix' : 'Undangan belum fix'} · ready to copy</span>
        {!invite.parts ? <ErrorBox error={invite.error ?? 'Template error'} /> : invite.parts.map((t, i) => (
          <div key={invite.codes[i]}>
            {i === 1 && <p className="mb-3 rounded-xl bg-gold-soft px-3 py-2 text-[13px] text-gold">🎥 Kirim 1 video di sini, lalu pesan 2</p>}
            <div className="mb-1 flex items-center gap-1.5 px-1"><span className="text-[12.5px] font-medium">Pesan {i + 1}</span><CaseChip code={invite.codes[i]} /></div>
            <p className="whitespace-pre-wrap rounded-xl bg-ink-2 p-3 text-[14.5px] text-white leading-[1.5]">{t}</p>
            <SendActions phone={d.lead.phone_e164} text={t} proactive linkFormat={d.link_format} onSent={markSent(invite.codes[i])} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- composer ----------

type ComposerMode = 'choose' | 'lead' | 'me';

function Composer({ d, reload, generate, generating }: { d: RoomData; reload: () => Promise<void>; generate: (i?: string) => Promise<void>; generating: boolean }) {
  const toast = useToast();
  const lastIsIn = d.lead.room.last_dir === 'IN';
  // Logic: paste the lead's reply first, then ask the AI what to answer.
  const initial: ComposerMode = lastIsIn || d.draft ? 'me' : 'choose';
  const [mode, setMode] = useState<ComposerMode>(initial);
  const [instruction, setInstruction] = useState('');
  useEffect(() => { setMode(initial); }, [d.lead.lead_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quick = async (c: string) => {
    if (!c) return;
    const r = await api<{ text: string | null; error: string | null }>(`/api/leads/${d.lead.lead_id}/render/${c}`);
    if (r.error) toast(r.error, 'err'); else window.dispatchEvent(new CustomEvent('room:insert', { detail: { text: r.text, code: c } }));
  };
  const run = async () => { await generate(instruction.trim() || undefined); setInstruction(''); };

  return (
    <div className="shrink-0 border-t border-black/[0.06] bg-[#f0f2f5] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <div className="mx-auto max-w-[720px]">
        {mode === 'choose' ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn h-12 rounded-full bg-white text-ink shadow-sm hover:bg-white/80" onClick={() => setMode('lead')}>Lead's reply</button>
            <button className="btn h-12 rounded-full bg-[#00a884] text-white hover:brightness-110" onClick={() => setMode('me')}>My reply</button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <button className="btn-quiet h-8 min-h-8 px-2" onClick={() => setMode('choose')} aria-label="Back">‹</button>
              <span className="text-[13px] font-medium">{mode === 'lead' ? "Paste the lead's reply" : 'What should I reply?'}</span>
              <span className="flex-1" />
              {mode === 'me' && (
                <select className="input h-8 min-h-8 w-auto py-0 text-[13px]" value="" onChange={(e) => quick(e.target.value)} aria-label="Insert template">
                  <option value="">Templates…</option>
                  {QUICK[d.lead.event].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
            {mode === 'lead' ? <PasteBox d={d} reload={reload} onNext={() => setMode('me')} /> : (
              <div>
                <div className="flex gap-2">
                  <input className="input flex-1 rounded-full" placeholder="Request, e.g. “ask which session they prefer”" value={instruction}
                    onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !generating) run(); }} />
                  <button className="btn rounded-full bg-[#00a884] text-white hover:brightness-110" disabled={generating} onClick={run}>{generating ? 'Writing…' : d.draft ? 'Regenerate' : 'Generate'}</button>
                </div>
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                  {INSTRUCTION_HINTS.map((h) => (
                    <button key={h} onClick={() => setInstruction((x) => (x ? `${x}, ${h.toLowerCase()}` : h))}
                      className="shrink-0 rounded-full border border-line-2 bg-surface px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-ink-3/50 hover:text-ink active:scale-[0.97]">{h}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PasteBox({ d, reload, onNext }: { d: RoomData; reload: () => Promise<void>; onNext: () => void }) {
  const { cfg } = useConfig();
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<PastedMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const myName = cfg?.config.my_whatsapp_name || 'Jackson';

  const save = async (msgs: { direction: 'IN' | 'OUT'; text: string; sent_at?: string | null; source?: string }[], gen: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ warning: string | null }>(`/api/leads/${d.lead.lead_id}/messages`, { body: { messages: msgs } });
      if (r.warning) toast(r.warning, 'err'); else toast(msgs.length > 1 ? `${msgs.length} messages saved` : 'Message saved');
      setRaw(''); setParsed(null);
      await reload();
      if (gen) onNext();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const toMsgs = (p: PastedMessage[]) => p.map((m) => ({ direction: m.direction, text: m.text, sent_at: m.sent_at, source: m.direction === 'IN' ? 'PASTED' : 'MANUAL' }));
  const quickSave = (gen: boolean) => {
    const p = parseWaPaste(raw, myName);
    if (p.length > 1) setParsed(p); // several messages: let me confirm who said what
    else save(toMsgs(p.length ? p : [{ direction: 'IN', text: raw.trim(), sent_at: null, sender: '' }]), gen);
  };

  if (parsed) {
    return (
      <div className="space-y-2">
        <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-canvas p-2">
          {parsed.map((m, i) => (
            <div key={i} className="flex items-start gap-2 text-[13.5px]">
              <button className={`chip shrink-0 ${m.direction === 'IN' ? 'border border-line-2 bg-surface' : 'bg-accent text-white'}`}
                onClick={() => setParsed(parsed.map((x, j) => (j === i ? { ...x, direction: x.direction === 'IN' ? 'OUT' : 'IN' } : x)))}>
                {m.direction === 'IN' ? 'Client' : 'Me'}
              </button>
              <div className="flex-1 whitespace-pre-wrap">{m.text}{m.sent_at && <span className="ml-1 text-xs text-ink-3">{fmtTime(m.sent_at)}</span>}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-3">Tap a label to switch Client/Me.</p>
        <div className="flex gap-2">
          <button className="btn-accent flex-1" disabled={busy || !parsed.length} onClick={() => save(toMsgs(parsed), true)}>Save & next</button>
          <button className="btn-ghost" onClick={() => setParsed(null)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <textarea className="input min-h-[72px] resize-y" value={raw} onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste the client message from WhatsApp…" aria-label="Client message"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && raw.trim()) quickSave(true); }} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-accent flex-1 sm:flex-none" disabled={!raw.trim() || busy} onClick={() => quickSave(true)}>Save & next</button>
        <button className="btn-quiet" disabled={!raw.trim() || busy} onClick={() => save([{ direction: 'OUT', text: raw.trim(), source: 'MANUAL' }], false)} title="A message you typed directly in WhatsApp">This is my message</button>
      </div>
    </div>
  );
}

// ---------- details ----------

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex gap-3 py-1.5 text-[13.5px]"><span className="w-24 shrink-0 text-ink-3">{k}</span><span className="min-w-0 flex-1 break-words">{children}</span></div>;
}

function Profile({ d, patch }: { d: RoomData; patch: Patch }) {
  const { lead } = d;
  const toast = useToast();
  const { readOnly } = useView();
  const [edit, setEdit] = useState(false);
  const [editInfo, setEditInfo] = useState(false);
  const [callName, setCallName] = useState(lead.call_name);
  useEffect(() => setCallName(lead.call_name), [lead.call_name]);
  return (
    <section className="border-b border-line p-4">
      <div className="flex flex-col items-center pb-3 pt-2 text-center">
        <Avatar name={lead.call_name || lead.full_name} event={lead.event} size={56} />
        <h2 className="mt-2 text-[17px] font-semibold">{lead.full_name}</h2>
        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
          <EventChip event={lead.event} /><StateChip state={lead.state as LeadState} /><CaseChip code={lead.case} />
          {lead.needs_pa && !lead.pa_forwarded && <span className="chip bg-gold-soft text-gold">Needs PA</span>}
        </div>
      </div>
      {lead.call_name_needs_review && !readOnly && (
        <div className="mb-2 space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
          <p className="text-amber-900">Please check the greeting name</p>
          <div className="flex gap-2">
            <input className="input" value={callName} onChange={(e) => setCallName(e.target.value)} aria-label="Greeting name" />
            <button className="btn-ghost" onClick={() => patch({ call_name: callName, call_name_ok: true }, 'Greeting name saved')}>Save</button>
          </div>
        </div>
      )}
      {editInfo ? <InfoEdit lead={lead} onSave={async (b) => { await patch(b, 'Info saved'); setEditInfo(false); }} onCancel={() => setEditInfo(false)} /> : !readOnly && (
        <div className="mb-1 flex justify-end"><button className="text-[13px] text-accent" onClick={() => setEditInfo(true)}>Edit info</button></div>
      )}
      <div className="divide-y divide-line">
        <Row k="Greeting">{lead.gender || 'Bapak/Ibu'} {lead.call_name}</Row>
        {lead.bitrix_status && <Row k="Bitrix">{lead.bitrix_status}</Row>}
        <Row k="WhatsApp">{lead.phone_e164 ? `+${lead.phone_e164}` : <span className="text-ink-3">None</span>}</Row>
        {lead.email && <Row k="Email">{lead.email}</Row>}
        {lead.agent_name && <Row k="Agent">{lead.agent_name}</Row>}
        {lead.source && <Row k="Source">{lead.source}</Row>}
        <Row k={lead.event === 'ROADSHOW' ? 'Visit' : 'Session'}>
          {edit ? <AttendanceEdit lead={lead} onSave={async (b) => { await patch(b); setEdit(false); }} onCancel={() => setEdit(false)} /> : (
            <span className="flex items-baseline gap-2">
              <span className="flex-1">{lead.event === 'ROADSHOW'
                ? <>{lead.visit_date_label || 'Not decided'}{lead.arrival_time && ` · ${lead.arrival_time.replace(':', '.')} WIB`}</>
                : <>{sessionInfo(lead.session)?.label ?? (lead.info_only ? 'Info only' : 'Not decided')} · {guestsLabel(lead) ?? 'guests ?'}</>}</span>
              {!readOnly && <button className="text-[13px] text-accent" onClick={() => setEdit(true)}>Edit</button>}
            </span>
          )}
        </Row>
      </div>
      {d.also_registered.length > 0 && <p className="mt-2 text-xs text-sky-800">Also registered for {d.also_registered.map((e) => (e === 'ROADSHOW' ? 'Roadshow' : 'Jesselton')).join(', ')}</p>}
      {lead.no_whatsapp && <p className="mt-2 rounded-xl bg-canvas p-2.5 text-xs text-ink-2">No WhatsApp: no reminder is prepared.</p>}
      {lead.opt_out && <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700">Do not contact (opt-out / declined): no reminder is prepared.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-ghost text-[13px]" onClick={async () => { await copyText(d.contact_name); toast('Contact name copied'); }}>Copy contact name</button>
        <a className="btn-ghost text-[13px]" href={`https://wa.me/${lead.phone_e164}`} target="_blank" rel="noopener">Open chat</a>
      </div>
    </section>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

/** Every column of the Excel file (except Notes, edited below) in one form. */
function InfoEdit({ lead, onSave, onCancel }: { lead: LeadView; onSave: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState({
    full_name: lead.full_name, gender: lead.gender, phone: lead.phone_e164, email: lead.email, bitrix_status: lead.bitrix_status,
    source: lead.source, visit_date: lead.visit_date ?? '', session: lead.session, info_only: lead.info_only,
    guests: lead.guests ? String(lead.guests) : lead.guests_bucket === '3+' ? '3+' : '',
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const save = () => onSave({
    full_name: v.full_name, gender: v.gender, phone: v.phone, bitrix_status: v.bitrix_status,
    ...(lead.event === 'ROADSHOW'
      ? { email: v.email, visit_date: v.visit_date || null }
      : { source: v.source, session: v.session, info_only: v.info_only, guests: v.guests && v.guests !== '3+' ? Number(v.guests) : null,
        guests_bucket: v.guests === '3+' ? '3+' : v.guests ? '' : 'unknown' }),
  });
  return (
    <div className="mb-3 space-y-2 rounded-xl bg-canvas p-3">
      <F label="Name"><input className="input" value={v.full_name} onChange={set('full_name')} /></F>
      <F label="Gender"><select className="input" value={v.gender} onChange={set('gender')}><option value="Bapak">Bapak</option><option value="Ibu">Ibu</option><option value="">—</option></select></F>
      <F label="Phone number"><input className="input" value={v.phone} onChange={set('phone')} /></F>
      {lead.event === 'ROADSHOW' ? (
        <>
          <F label="Email"><input className="input" value={v.email} onChange={set('email')} /></F>
          <F label="Date"><select className="input" value={v.visit_date} onChange={set('visit_date')}><option value="">Belum pasti</option>{DATES.map((x, i) => <option key={x} value={x}>{DATE_OPTIONS[i]}</option>)}</select></F>
        </>
      ) : (
        <>
          <F label="Website / Meta"><select className="input" value={v.source} onChange={set('source')}><option value="Meta">Meta</option><option value="Website">Website</option><option value="">—</option></select></F>
          <F label="Time"><select className="input" value={v.session} onChange={set('session')}><option value="S1">11:00-13:00</option><option value="S2">15:00-17:00</option><option value="UNDECIDED">Belum pasti, Kirim info saja</option><option value="NONE">None</option></select></F>
          <F label="Guest (number or 3+)"><input className="input" value={v.guests} onChange={(e) => setV((x) => ({ ...x, guests: e.target.value.replace(/[^0-9+]/g, '') }))} /></F>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={v.info_only} onChange={set('info_only')} /> Kirim info saja</label>
        </>
      )}
      <F label="Status in Bitrix"><input className="input" value={v.bitrix_status} onChange={set('bitrix_status')} /></F>
      <div className="flex gap-2 pt-1"><button className="btn-primary h-9 min-h-9" onClick={save}>Save</button><button className="btn-quiet h-9 min-h-9" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function AttendanceEdit({ lead, onSave, onCancel }: { lead: LeadView; onSave: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [date, setDate] = useState(lead.visit_date ?? '');
  const [time, setTime] = useState(lead.arrival_time);
  const [session, setSession] = useState(lead.session);
  const [guests, setGuests] = useState(lead.guests ? String(lead.guests) : lead.guests_bucket === '3+' ? '3+' : '');
  const [infoOnly, setInfoOnly] = useState(lead.info_only);
  const save = () => {
    if (lead.event === 'ROADSHOW') onSave({ visit_date: date || null, arrival_time: time });
    else onSave({ session, info_only: infoOnly, guests: guests && guests !== '3+' ? Number(guests) : null, guests_bucket: guests === '3+' ? '3+' : guests ? '' : 'unknown' });
  };
  return (
    <div className="space-y-2">
      {lead.event === 'ROADSHOW' ? (
        <>
          <select className="input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Visit date">
            <option value="">Not decided</option>{DATES.map((x, i) => <option key={x} value={x}>{DATE_OPTIONS[i]}</option>)}
          </select>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Arrival time" />
        </>
      ) : (
        <>
          <select className="input" value={session} onChange={(e) => setSession(e.target.value as typeof session)} aria-label="Session">
            <option value="S1">11.00–13.00</option><option value="S2">15.00–17.00</option><option value="UNDECIDED">Not decided</option><option value="NONE">None</option>
          </select>
          <input className="input" placeholder="Guests (number / 3+)" value={guests} onChange={(e) => setGuests(e.target.value.replace(/[^0-9+]/g, ''))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={infoOnly} onChange={(e) => setInfoOnly(e.target.checked)} /> Send info only</label>
        </>
      )}
      <div className="flex gap-2"><button className="btn-primary h-9 min-h-9" onClick={save}>Save</button><button className="btn-quiet h-9 min-h-9" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function Actions({ d, patch }: { d: RoomData; patch: Patch }) {
  const { lead } = d;
  const [notes, setNotes] = useState(lead.notes);
  const [paNote, setPaNote] = useState('');
  const [nextStep, setNextStep] = useState(lead.next_step);
  // {salam} in a suggested reminder becomes pagi/siang/sore/malam at the moment it is shown.
  const withSalam = (t: string) => t.replaceAll('{salam}', getSalam(new Date()));
  const [reminder, setReminder] = useState(withSalam(lead.reminder_text));
  const toast = useToast();
  useEffect(() => setNotes(lead.notes), [lead.notes]);
  useEffect(() => setNextStep(lead.next_step), [lead.next_step]);
  useEffect(() => setReminder(withSalam(lead.reminder_text)), [lead.reminder_text]); // eslint-disable-line react-hooks/exhaustive-deps
  const { readOnly } = useView();
  if (readOnly) {
    return (
      <section className="space-y-4 p-4">
        <div><div className="eyebrow mb-2">WhatsApp status</div>{lead.wa_status ? <WaChip status={lead.wa_status} /> : <span className="text-sm text-ink-3">Not checked</span>}</div>
        {lead.next_step && <div><div className="eyebrow mb-1">Next step</div><p className="text-[13.5px]">{lead.next_step}</p></div>}
        {!d.invite && reminder.trim() && (
          <div>
            <div className="eyebrow mb-1">Reminder</div>
            <p className="whitespace-pre-wrap rounded-xl bg-canvas p-2.5 text-[13.5px]">{reminder}</p>
            <button className="btn-ghost mt-2 h-9 min-h-9 text-[13px]" onClick={async () => { await copyText(reminder); toast('Reminder copied'); }}>Copy</button>
          </div>
        )}
        {lead.notes && <div><div className="eyebrow mb-1">Notes</div><p className="whitespace-pre-wrap text-[13.5px]">{lead.notes}</p></div>}
      </section>
    );
  }
  return (
    <section className="space-y-4 p-4">
      <div className={`-mx-1 rounded-xl p-1 ${lead.wa_status === 'CONFIRMED' ? 'bg-emerald-50' : lead.wa_status === 'BAD_LEAD' ? 'bg-red-50' : ''}`}>
        <div className="eyebrow mb-2">WhatsApp status</div>
        <select className="input" value={lead.wa_status} onChange={(e) => patch({ wa_status: e.target.value }, 'Status changed')} aria-label="WhatsApp status">
          <option value="">Not checked</option>
          {Object.entries(WA_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="eyebrow mb-1 mt-3">Next step</div>
        <input className="input" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Reminder H-1" />
        {nextStep !== lead.next_step && <button className="btn-primary mt-2 h-9 min-h-9" onClick={() => patch({ next_step: nextStep }, 'Next step saved')}>Save</button>}
        {d.invite ? <p className="mt-3 text-xs text-ink-3">Reminder Jesselton ada di chat (pesan 1 → video → pesan 2).</p> : (
          <>
            <div className="eyebrow mb-1 mt-3">Reminder (copy, send yourself)</div>
            <textarea className="input min-h-32 text-[13.5px]" value={reminder} onChange={(e) => setReminder(e.target.value)} placeholder="No reminder needed" />
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost h-9 min-h-9 text-[13px]" disabled={!reminder.trim()} onClick={async () => { await copyText(reminder); toast('Reminder copied'); }}>Copy</button>
              {reminder !== withSalam(lead.reminder_text) && <button className="btn-primary h-9 min-h-9" onClick={() => patch({ reminder_text: reminder }, 'Reminder saved')}>Save</button>}
            </div>
          </>
        )}
      </div>
      <div>
        <div className="eyebrow mb-2">Status</div>
        <select className="input" value={lead.state} onChange={(e) => patch({ state: e.target.value }, 'Status changed')} aria-label="Lead status">
          {Object.entries(STATE_EN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="mt-2 flex flex-wrap gap-2">
          {lead.state !== 'DONE' && <button className="btn-ghost h-9 min-h-9 text-[13px]" onClick={() => patch({ state: 'DONE' }, 'Marked as Done (attended)')}>Attended · Done</button>}
          {lead.needs_attention && <button className="btn-ghost h-9 min-h-9 text-[13px]" onClick={() => patch({ needs_attention: false }, 'Attention flag cleared')}>Handled</button>}
          {lead.opt_out || lead.no_whatsapp
            ? <button className="btn-ghost h-9 min-h-9 text-[13px]" onClick={() => patch({ opt_out: false, no_whatsapp: false }, 'Can be contacted again')}>Allow contact again</button>
            : <>
                <button className="btn-ghost h-9 min-h-9 text-[13px]" onClick={() => patch({ no_whatsapp: true }, 'Marked as No WhatsApp')}>No WhatsApp</button>
                <button className="btn-danger h-9 min-h-9 text-[13px]" onClick={() => window.confirm('Mark as do not contact? No more reminders will be prepared.') && patch({ opt_out: true }, 'Marked as do not contact')}>Opt out</button>
              </>}
        </div>
      </div>
      {lead.needs_pa && !lead.pa_forwarded && (
        <div>
          <div className="eyebrow mb-2">Property Advisor</div>
          <input className="input" placeholder="Note for the PA (optional)" value={paNote} onChange={(e) => setPaNote(e.target.value)} />
          <button className="btn-gold mt-2 w-full" onClick={() => patch({ pa_forwarded: true, notes: paNote ? `${lead.notes}\n[PA] ${paNote}`.trim() : lead.notes }, 'Marked as forwarded to PA')}>Forwarded to PA</button>
        </div>
      )}
      <div>
        <div className="eyebrow mb-2">Notes</div>
        <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Private notes about this client" />
        {notes !== lead.notes && <button className="btn-primary mt-2 h-9 min-h-9" onClick={() => patch({ notes }, 'Notes saved')}>Save notes</button>}
      </div>
    </section>
  );
}
