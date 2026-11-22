import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LeadView } from '../../domain/dashboard';
import type { LinkFormat } from '../../domain/links';
import type { NextMessage } from '../../domain/next-message';
import { renderForLead } from '../../domain/next-message';
import { api } from '../api';
import { CaseChip, copyText, ErrorBox, EventChip, Loading, refreshSalam, SendActions, useToast, Warnings } from '../shared';

interface Item { lead: LeadView; next: NextMessage; contact_name: string }
const KINDS = [['first', 'First message'], ['reminder', 'Reminder']] as const;

export function BulkPage() {
  const [sp, setSp] = useSearchParams();
  const kind = sp.get('kind') ?? 'first';
  const event = sp.get('event') ?? 'ALL';
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [linkFormat, setLinkFormat] = useState<LinkFormat>('wa.me');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [onlyToday, setOnlyToday] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<Record<string, any> | null>(null);

  const load = () => {
    setErr(''); setItems(null);
    api(`/api/bulk?kind=${kind}&event=${event}`).then((r) => { setItems(r.items); setLinkFormat(r.link_format); }).catch((e) => setErr(e.message));
  };
  useEffect(load, [kind, event]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('/api/templates').then((r) => setTemplates(Object.fromEntries(r.templates.map((t: any) => [t.code, t])))).catch(() => {}); }, []);

  const visible = useMemo(() => {
    const list = (items ?? []).filter((i) => !onlyToday || i.lead.created_today);
    return [...list.filter((i) => !sent.has(i.lead.lead_id)), ...list.filter((i) => sent.has(i.lead.lead_id))];
  }, [items, onlyToday, sent]);

  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };

  const copyAll = async () => {
    const pick = visible.filter((i) => !sent.has(i.lead.lead_id) && i.next.text && (!selected.size || selected.has(i.lead.lead_id)));
    const text = pick.map((i) => `*${i.contact_name}*\nhttps://wa.me/${i.lead.phone_e164}\n\n${refreshSalam(i.next.text!)}`).join('\n\n\n');
    if (await copyText(text)) toast(`${pick.length} messages copied`); else toast('Could not copy', 'err');
  };

  return (
    <div className="space-y-3">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Bulk messages</h1>
      <div className="segmented grid w-full grid-cols-2">
        {KINDS.map(([k, v]) => <button key={k} onClick={() => set('kind', k)} className={`seg ${kind === k ? 'seg-on' : ''}`}>{v}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <select className="input flex-1" value={event} onChange={(e) => set('event', e.target.value)}>
          <option value="ALL">All events</option><option value="ROADSHOW">Roadshow</option><option value="JESSELTON">Jesselton</option>
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} /> Only added today</label>
      </div>
      <div className="flex gap-2">
        <button className="btn-gold flex-1" disabled={!visible.length} onClick={copyAll}>Copy all{selected.size ? ` (${selected.size} selected)` : ''}</button>
        <button className="btn-ghost" onClick={load}>Refresh</button>
      </div>
      {err && <ErrorBox error={err} onRetry={load} />}
      {!items && !err && <Loading />}
      {items && !visible.length && <p className="card text-sm text-ink-2">No messages to send.</p>}
      {visible.map((i) => {
        const done = sent.has(i.lead.lead_id);
        const posterCode = i.lead.event === 'ROADSHOW' ? 'POSTER-A' : 'POSTER-B';
        const poster = templates ? renderForLead(posterCode, i.lead, templates, new Date()) : null;
        return (
          <div key={i.lead.lead_id} className={`card space-y-2 ${done ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={selected.has(i.lead.lead_id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(i.lead.lead_id); else n.delete(i.lead.lead_id); return n; })} />
              <EventChip event={i.lead.event} />
              <CaseChip code={i.next.case.code} />
              {i.next.cross_event && <span className="chip bg-sky-100 text-sky-800">CROSS_EVENT</span>}
              {done && <span className="chip bg-emerald-100 text-emerald-800">Sent</span>}
              <Link to={`/room/${i.lead.lead_id}`} className="ml-auto text-xs text-accent">Open</Link>
            </div>
            <div className="text-sm font-semibold">{i.contact_name}</div>
            <div className="text-xs text-ink-3">https://wa.me/{i.lead.phone_e164}</div>
            <Warnings items={i.next.warnings} />
            {i.next.error ? <ErrorBox error={i.next.error} /> : <pre className="whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans text-sm">{i.next.text}</pre>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={async () => { await copyText(i.contact_name); toast('Contact name copied'); }}>Copy contact name</button>
              {poster?.text && <button className="btn-ghost" onClick={async () => { await copyText(poster.text!); toast('Poster caption copied. Send the image first with this text as its caption.'); }}>Copy poster caption</button>}
              <a className="btn-ghost" href={i.lead.event === 'ROADSHOW' ? '/einvite/roadshow.jpeg' : '/einvite/jesselton.jpeg'} download>Download poster</a>
            </div>
            {!done && i.next.text && (
              <SendActions phone={i.lead.phone_e164} text={i.next.text} proactive linkFormat={linkFormat} compact
                onSent={async (final) => {
                  await api(`/api/leads/${i.lead.lead_id}/mark-sent`, { body: { text: final, template_code: i.next.template_code } });
                  setSent((s) => new Set(s).add(i.lead.lead_id));
                  toast('Recorded, status updated');
                }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
