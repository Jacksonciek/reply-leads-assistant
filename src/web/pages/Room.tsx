import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { sessionInfo } from '../../../config/events';
import type { LeadView } from '../../domain/dashboard';
import { flagLabel } from '../../domain/guardrails';
import type { LinkFormat } from '../../domain/links';
import type { NextMessage } from '../../domain/next-message';
import { parseWaPaste, type PastedMessage } from '../../domain/parse-wa-paste';
import { INTENT_LABEL, type AnyIntent } from '../../domain/routing';
import { DATE_OPTIONS } from '../../domain/sheet-row';
import { guestsLabel, STATE_LABEL, type Draft, type LeadState, type Message } from '../../domain/types';
import { useConfig } from '../App';
import { api } from '../api';
import {
  CaseChip, copyText, ErrorBox, EventChip, fmtTime, Loading, Modal, SendActions, StateChip, useToast, Warnings,
} from '../shared';

interface RoomData {
  lead: LeadView; messages: Message[]; draft: Draft | null; next: NextMessage; contact_name: string;
  also_registered: string[]; link_format: LinkFormat; poster: string;
}

const DATES = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const QUICK: Record<string, string[]> = {
  ROADSHOW: ['HANDOFF_PA', 'CALL_REQUEST', 'PA_TIME_ACK', 'HOLD', 'SOURCE', 'DECLINE', 'OPT_OUT', 'KONF-A', 'SOFT_CONFIRM-A', 'REMINDER_PA-A', 'A3', 'A4', 'POSTER-A'],
  JESSELTON: ['HANDOFF_PA', 'CALL_REQUEST', 'PA_TIME_ACK', 'HOLD', 'SOURCE', 'DECLINE', 'OPT_OUT', 'KONF-B', 'SOFT_CONFIRM-B', 'REMINDER_PA-B', 'B4', 'B5', 'POSTER-B'],
};
const SOURCE_LABEL: Record<string, string> = { PASTED: 'tempelan', TEMPLATE: 'template', LLM_DRAFT: 'draft AI', EDITED_DRAFT: 'draft diedit', MANUAL: 'manual' };

export function RoomPage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const [d, setD] = useState<RoomData | null>(null);
  const [err, setErr] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => { setErr(''); return api<RoomData>(`/api/leads/${id}`).then(setD).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);

  const generate = useCallback(async (instruction?: string) => {
    setGenerating(true);
    try { await api(`/api/leads/${id}/generate`, { body: { instruction } }); await load(); } catch (e) { toast((e as Error).message, 'err'); } finally { setGenerating(false); }
  }, [id, load, toast]);

  useEffect(() => {
    if (sp.get('generate') === '1' && d) { setSp({}, { replace: true }); generate(); }
  }, [sp, d, generate, setSp]);

  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!d) return <Loading />;
  const { lead } = d;
  const accent = lead.event === 'ROADSHOW' ? 'border-t-navy' : 'border-t-forest';

  const patch = async (body: Record<string, unknown>, msg = 'Tersimpan') => {
    try { await api(`/api/leads/${lead.lead_id}`, { method: 'PATCH', body }); toast(msg); await load(); } catch (e) { toast((e as Error).message, 'err'); }
  };

  return (
    <div className="space-y-3">
      <Header d={d} accent={accent} patch={patch} />
      <History d={d} reload={load} />
      <NextPanel d={d} reload={load} generate={generate} generating={generating} />
      <PasteBox d={d} reload={load} generate={generate} />
      <Actions d={d} patch={patch} />
    </div>
  );
}

function Header({ d, accent, patch }: { d: RoomData; accent: string; patch: (b: Record<string, unknown>, m?: string) => Promise<void> }) {
  const { lead } = d;
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [callName, setCallName] = useState(lead.call_name);
  useEffect(() => setCallName(lead.call_name), [lead.call_name]);
  return (
    <div className={`card border-t-4 ${accent}`}>
      <div className="flex flex-wrap items-center gap-2">
        <EventChip event={lead.event} />
        <StateChip state={lead.state as LeadState} />
        <CaseChip code={lead.case} />
        {lead.needs_attention && <span className="chip bg-red-100 text-red-700">Perlu perhatian</span>}
        {lead.needs_pa && !lead.pa_forwarded && <span className="chip bg-gold-soft text-gold">Perlu PA</span>}
      </div>
      <h1 className="mt-2 text-lg font-semibold">{lead.gender || 'Bapak/Ibu'} {lead.call_name}</h1>
      <p className="text-xs text-stone-500">{lead.full_name}{lead.agent_name && ` · agen: ${lead.agent_name}`}</p>
      {lead.call_name_needs_review && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-2 text-sm">
          <span className="text-amber-900">Nama sapaan perlu dicek:</span>
          <input className="input max-w-40" value={callName} onChange={(e) => setCallName(e.target.value)} />
          <button className="btn-ghost" onClick={() => patch({ call_name: callName, call_name_ok: true }, 'Nama sapaan disimpan')}>Simpan / sudah benar</button>
        </div>
      )}
      {d.also_registered.length > 0 && <p className="mt-2 text-xs text-sky-800">Terdaftar juga di {d.also_registered.map((e) => (e === 'ROADSHOW' ? 'Roadshow' : 'Jesselton')).join(', ')}</p>}
      {lead.state === 'NO_WHATSAPP' && <p className="mt-2 rounded-md bg-stone-100 p-2 text-sm">Lead tanpa WhatsApp, dikecualikan dari antrean.{lead.email && ` Email: ${lead.email}`}</p>}
      <div className="mt-3 text-sm">
        {!edit ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {lead.event === 'ROADSHOW'
              ? <span>📅 {lead.visit_date_label || 'Tanggal belum pasti'}{lead.arrival_time && ` · ${lead.arrival_time.replace(':', '.')} WIB`}</span>
              : <span>🕒 {sessionInfo(lead.session)?.label ?? (lead.info_only ? 'Info saja' : 'Sesi belum')} · 👥 {guestsLabel(lead) ?? 'tamu belum tahu'}</span>}
            <button className="text-navy underline" onClick={() => setEdit(true)}>Ubah</button>
          </div>
        ) : <AttendanceEdit lead={lead} onSave={async (b) => { await patch(b); setEdit(false); }} onCancel={() => setEdit(false)} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={async () => { await copyText(d.contact_name); toast('Nama kontak disalin'); }}>Salin nama kontak</button>
        <a className="btn-ghost" href={`https://wa.me/${lead.phone_e164}`} target="_blank" rel="noopener">Buka chat kosong</a>
      </div>
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
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={date} onChange={(e) => setDate(e.target.value)}>
            <option value="">Belum pasti</option>{DATES.map((x, i) => <option key={x} value={x}>{DATE_OPTIONS[i]}</option>)}
          </select>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={session} onChange={(e) => setSession(e.target.value as typeof session)}>
            <option value="S1">11.00–13.00</option><option value="S2">15.00–17.00</option><option value="UNDECIDED">Belum pasti</option><option value="NONE">Kosong</option>
          </select>
          <input className="input" placeholder="Jumlah tamu (angka / 3+)" value={guests} onChange={(e) => setGuests(e.target.value.replace(/[^0-9+]/g, ''))} />
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={infoOnly} onChange={(e) => setInfoOnly(e.target.checked)} /> Kirim info saja</label>
        </div>
      )}
      <div className="flex gap-2"><button className="btn-primary" onClick={save}>Simpan</button><button className="btn-ghost" onClick={onCancel}>Batal</button></div>
    </div>
  );
}

function History({ d, reload }: { d: RoomData; reload: () => Promise<void> }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Message | null>(null);
  if (!d.messages.length) {
    return <div className="card text-sm text-stone-500">{d.lead.state === 'REPLIED' ? 'Belum ada riwayat. Tempel isi chat terakhir dari WhatsApp di bawah.' : 'Belum ada percakapan.'}</div>;
  }
  return (
    <div className="card space-y-2 bg-[#efeae2]">
      {d.messages.map((m) => (
        <div key={m.msg_id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
          <button onClick={() => setEditing(m)} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm shadow-sm ${m.direction === 'OUT' ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
            {m.text}
            <div className="mt-1 text-right text-[10px] text-stone-500">{fmtTime(m.sent_at)} · {m.direction === 'OUT' ? SOURCE_LABEL[m.source] ?? m.source : 'klien'}{m.template_code && ` · ${m.template_code}`}</div>
          </button>
        </div>
      ))}
      {editing && <EditMessage m={editing} onClose={() => setEditing(null)} onDone={async (msg) => { setEditing(null); toast(msg); await reload(); }} />}
    </div>
  );
}

function EditMessage({ m, onClose, onDone }: { m: Message; onClose: () => void; onDone: (msg: string) => void }) {
  const toast = useToast();
  const [text, setText] = useState(m.text);
  const [dir, setDir] = useState(m.direction);
  const save = async () => {
    try { await api(`/api/messages/${m.msg_id}`, { method: 'PATCH', body: { text, direction: dir } }); onDone('Pesan diperbarui'); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const del = async () => {
    if (!window.confirm('Hapus pesan ini dari room?')) return;
    try { await api(`/api/messages/${m.msg_id}`, { method: 'DELETE' }); onDone('Pesan dihapus'); } catch (e) { toast((e as Error).message, 'err'); }
  };
  return (
    <Modal title="Edit pesan" onClose={onClose}>
      <textarea className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)} />
      <select className="input mt-2" value={dir} onChange={(e) => setDir(e.target.value as 'IN' | 'OUT')}><option value="IN">Dari klien</option><option value="OUT">Dari saya</option></select>
      <div className="mt-3 flex gap-2"><button className="btn-primary flex-1" onClick={save}>Simpan</button><button className="btn-danger" onClick={del}>Hapus</button></div>
    </Modal>
  );
}

function NextPanel({ d, reload, generate, generating }: { d: RoomData; reload: () => Promise<void>; generate: (i?: string) => Promise<void>; generating: boolean }) {
  const { lead, next, draft } = d;
  const toast = useToast();
  const lastIsIn = lead.room.last_dir === 'IN';
  const [text, setText] = useState('');
  const [code, setCode] = useState<string | undefined>();
  const [instruction, setInstruction] = useState('');
  const [showRegen, setShowRegen] = useState(false);

  // Source of the panel: pending draft (conversation) or proactive template.
  const mode: 'draft' | 'template' | 'none' = draft ? 'draft' : next.template_code && !lastIsIn ? 'template' : 'none';
  useEffect(() => {
    if (draft) { setText(draft.draft_text); setCode(draft.template_code || undefined); }
    else if (mode === 'template') { setText(next.text ?? ''); setCode(next.template_code ?? undefined); }
    else { setText(''); setCode(undefined); }
  }, [draft?.draft_id, next.text, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const flags = draft?.flags ? draft.flags.split('|').filter(Boolean) : [];
  const notes = flags.filter((f) => f.startsWith('note:')).map((f) => f.slice(5));
  const guard = flags.filter((f) => f.startsWith('guardrail:')).map((f) => flagLabel(f.slice(10)));
  const suggestion = draft?.suggestion_json ? JSON.parse(draft.suggestion_json) as Record<string, unknown> : {};
  const extracted = draft?.extracted_json ? Object.entries(JSON.parse(draft.extracted_json) as Record<string, unknown>).filter(([, v]) => v != null && v !== '') : [];

  const markSent = async (final: string) => {
    await api(`/api/leads/${lead.lead_id}/mark-sent`, { body: { text: final, template_code: draft ? undefined : code, draft_id: draft?.draft_id } });
    toast('Tercatat di room');
    await reload();
  };
  const quick = async (c: string) => {
    if (!c) return;
    const r = await api<{ text: string | null; error: string | null }>(`/api/leads/${lead.lead_id}/render/${c}`);
    if (r.error) toast(r.error, 'err'); else { setText(r.text!); setCode(c); }
  };
  const applySuggestion = async () => {
    try { await api(`/api/leads/${lead.lead_id}/apply-suggestion`, { body: { draft_id: draft!.draft_id } }); toast('Saran diterapkan'); await reload(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const discard = async () => { await api(`/api/drafts/${draft!.draft_id}/discard`, { body: {} }); await reload(); };
  const posterCode = code === 'A3' || code === 'A4' || code?.startsWith('POSTER') || flags.includes('attach_poster');
  const proactive = mode === 'template';

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pesan berikutnya</h2>
        {mode === 'template' && <span className="text-xs text-stone-500">Template {next.template_code}{next.cross_event && ' · varian CROSS_EVENT'}</span>}
      </div>
      <Warnings items={next.warnings} />
      {mode === 'none' && !lastIsIn && <p className="text-sm text-stone-500">{next.case.code === 'WAIT' ? 'Menunggu balasan klien. Reminder akan muncul setelah 24 jam.' : next.error ?? next.case.reason}</p>}
      {mode === 'template' && next.error && <ErrorBox error={next.error} />}
      {mode === 'none' && lastIsIn && (
        <button className="btn-primary w-full" disabled={generating} onClick={() => generate()}>{generating ? 'Membuat draft…' : 'Buat draft balasan'}</button>
      )}
      {draft && (
        <div className="space-y-1 rounded-lg bg-stone-50 p-3 text-sm">
          <div><span className="font-medium">{INTENT_LABEL[draft.intent as AnyIntent] ?? draft.intent}</span>{draft.confidence && Number(draft.confidence) < 1 && <span className="text-stone-500"> · yakin {Math.round(Number(draft.confidence) * 100)}%</span>}</div>
          {draft.reason && <div className="text-stone-600">{draft.reason}</div>}
          {extracted.length > 0 && <div className="text-xs text-stone-600">Terdeteksi: {extracted.map(([k, v]) => `${k}=${v}`).join(', ')}</div>}
          {flags.includes('needs_attention') && <div className="chip bg-red-100 text-red-700">Perlu perhatian</div>}
          {notes.map((n) => <div key={n} className="text-xs text-sky-800">{n}</div>)}
          {guard.length > 0 && <div className="text-xs text-red-700">Guardrail: {guard.join(', ')}</div>}
          {draft.original_text && <details className="text-xs"><summary className="cursor-pointer text-red-700">Lihat draft asli (ditolak)</summary><p className="mt-1 whitespace-pre-wrap">{draft.original_text}</p></details>}
          {notes.some((n) => n.includes('FAQ')) && <a className="text-xs text-navy underline" href="/faq">Tambah ke FAQ</a>}
          {Object.keys(suggestion).length > 0 && (
            <button className="btn-gold mt-1" onClick={applySuggestion}>Terapkan: {Object.entries(suggestion).map(([k, v]) => k === 'state' ? STATE_LABEL[v as LeadState] : `${k}=${v}`).join(', ')}</button>
          )}
        </div>
      )}
      {(mode !== 'none' || text) && (
        <>
          {draft?.draft_source === 'NONE' && !text && <p className="text-sm text-stone-600">Tidak perlu dibalas. Anda tetap bisa menulis atau menyisipkan teks.</p>}
          <textarea className="input min-h-48 whitespace-pre-wrap" value={text} onChange={(e) => setText(e.target.value)} />
          {posterCode && (
            <div className="rounded-md bg-gold-soft p-2 text-xs">
              Kirim gambar poster dulu dengan teks ini sebagai caption, supaya jadi satu pesan. <a className="underline" href={d.poster} download>Unduh poster</a>
            </div>
          )}
          <SendActions phone={lead.phone_e164} text={text} proactive={proactive} linkFormat={d.link_format} disabled={!text.trim()} onSent={markSent} />
        </>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <select className="input flex-1" value="" onChange={(e) => quick(e.target.value)}>
          <option value="">Sisip cepat…</option>
          {QUICK[lead.event].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(draft || lastIsIn) && <button className="btn-ghost" onClick={() => setShowRegen((x) => !x)}>Buat ulang</button>}
        {draft && <button className="btn-ghost" onClick={discard}>Abaikan draft</button>}
      </div>
      {showRegen && (
        <div className="flex gap-2">
          <input className="input flex-1" placeholder='Instruksi (mis. "lebih singkat")' value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <button className="btn-primary" disabled={generating} onClick={async () => { await generate(instruction || undefined); setShowRegen(false); setInstruction(''); }}>{generating ? '…' : 'Buat'}</button>
        </div>
      )}
    </div>
  );
}

function PasteBox({ d, reload, generate }: { d: RoomData; reload: () => Promise<void>; generate: (i?: string) => Promise<void> }) {
  const { cfg } = useConfig();
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<PastedMessage[] | null>(null);
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const myName = cfg?.config.my_whatsapp_name || 'Jackson';
  const parsed = useMemo(() => preview, [preview]);

  const save = async (msgs: { direction: 'IN' | 'OUT'; text: string; sent_at?: string | null; source?: string }[], gen: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ warning: string | null }>(`/api/leads/${d.lead.lead_id}/messages`, { body: { messages: msgs } });
      if (r.warning) toast(r.warning, 'err');
      setRaw(''); setPreview(null); setMine('');
      await reload();
      if (gen && msgs[msgs.length - 1]?.direction === 'IN') await generate();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="card space-y-2">
      <label className="label">Tempel balasan klien</label>
      <textarea className="input min-h-24" value={raw} onChange={(e) => { setRaw(e.target.value); setPreview(null); }} placeholder="Salin pesan klien dari WhatsApp lalu tempel di sini" />
      {!parsed && <button className="btn-primary w-full" disabled={!raw.trim() || busy} onClick={() => setPreview(parseWaPaste(raw, myName))}>Pratinjau</button>}
      {parsed && (
        <div className="space-y-2">
          {parsed.map((m, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md bg-stone-50 p-2 text-sm">
              <button className={`chip shrink-0 ${m.direction === 'IN' ? 'bg-white' : 'bg-[#d9fdd3]'}`} onClick={() => setPreview(parsed.map((x, j) => (j === i ? { ...x, direction: x.direction === 'IN' ? 'OUT' : 'IN' } : x)))}>
                {m.direction === 'IN' ? 'Klien' : 'Saya'}
              </button>
              <div className="flex-1 whitespace-pre-wrap">{m.text}{m.sent_at && <span className="ml-1 text-xs text-stone-400">({fmtTime(m.sent_at)})</span>}</div>
            </div>
          ))}
          <p className="text-xs text-stone-500">Ketuk label untuk menukar Klien/Saya.</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy || !parsed.length} onClick={() => save(parsed.map((m) => ({ direction: m.direction, text: m.text, sent_at: m.sent_at, source: m.direction === 'IN' ? 'PASTED' : 'MANUAL' })), true)}>Simpan & buat draft</button>
            <button className="btn-ghost" onClick={() => setPreview(null)}>Batal</button>
          </div>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-navy">Tambah pesan saya (yang saya ketik langsung di WhatsApp)</summary>
        <textarea className="input mt-2 min-h-20" value={mine} onChange={(e) => setMine(e.target.value)} />
        <button className="btn-ghost mt-2" disabled={!mine.trim() || busy} onClick={() => save([{ direction: 'OUT', text: mine, source: 'MANUAL' }], false)}>Simpan pesan saya</button>
      </details>
    </div>
  );
}

function Actions({ d, patch }: { d: RoomData; patch: (b: Record<string, unknown>, m?: string) => Promise<void> }) {
  const { lead } = d;
  const [notes, setNotes] = useState(lead.notes);
  const [paNote, setPaNote] = useState('');
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Tindakan</h2>
      <div className="flex flex-wrap gap-2">
        {lead.state !== 'CONFIRMED' && <button className="btn-ghost" onClick={() => patch({ state: 'CONFIRMED' }, 'Ditandai terkonfirmasi')}>Tandai terkonfirmasi</button>}
        {!lead.opt_out && <button className="btn-danger" onClick={() => window.confirm('Tandai opt-out? Lead tidak akan muncul di antrean lagi.') && patch({ state: 'OPTED_OUT', opt_out: true }, 'Ditandai opt-out')}>Tandai opt-out</button>}
        {lead.needs_attention && <button className="btn-ghost" onClick={() => patch({ needs_attention: false }, 'Label perhatian dihapus')}>Sudah ditangani</button>}
      </div>
      {lead.needs_pa && !lead.pa_forwarded && (
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Catatan untuk PA (opsional)" value={paNote} onChange={(e) => setPaNote(e.target.value)} />
          <button className="btn-gold" onClick={() => patch({ pa_forwarded: true, notes: paNote ? `${lead.notes}\n[PA] ${paNote}`.trim() : lead.notes }, 'Ditandai sudah diteruskan ke PA')}>Sudah diteruskan ke PA</button>
        </div>
      )}
      <div>
        <label className="label">Ubah status manual</label>
        <select className="input" value={lead.state} onChange={(e) => patch({ state: e.target.value }, 'Status diubah')}>
          {Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Catatan</label>
        <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== lead.notes && <button className="btn-ghost mt-2" onClick={() => patch({ notes }, 'Catatan disimpan')}>Simpan catatan</button>}
      </div>
    </div>
  );
}
