import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import type { EventCode } from '../../../config/events';
import { sessionInfo } from '../../../config/events';
import type { LeadView } from '../../domain/dashboard';
import { guestsLabel, type LeadState } from '../../domain/types';
import { api } from '../api';
import { Avatar, ErrorBox, EventChip, EventDot, Loading, STATE_EN, StateChip } from '../shared';

export function exportXlsx(leads: LeadView[]) {
  const wb = XLSX.utils.book_new();
  for (const ev of ['ROADSHOW', 'JESSELTON'] as EventCode[]) {
    const rows = leads.filter((l) => l.event === ev).map((l) => ({
      Name: l.full_name,
      Phone: l.phone_e164,
      ...(ev === 'ROADSHOW' ? { Date: l.visit_date_label || 'Not decided', 'Arrival time': l.arrival_time } : { Session: sessionInfo(l.session)?.label ?? 'Not decided', Guests: guestsLabel(l) ?? '' }),
      Status: STATE_EN[l.state],
      'Needs PA': l.needs_pa ? 'Yes' : '',
      'PA time': l.pa_preferred_time,
      'Forwarded to PA': l.pa_forwarded ? 'Yes' : '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), ev === 'ROADSHOW' ? 'Roadshow' : 'Jesselton');
  }
  XLSX.writeFile(wb, `attendance-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

type EvFilter = 'ALL' | EventCode;
export interface WorkspaceCtx { refreshList: () => void }

export const relTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const mins = (now.getTime() - d.getTime()) / 60000;
  if (mins < 1) return 'now';
  if (mins < 60) return `${Math.floor(mins)}m`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const attendance = (l: LeadView) => l.event === 'ROADSHOW'
  ? l.visit_date_label ? `${l.visit_date_label}${l.arrival_time ? ` · ${l.arrival_time.replace(':', '.')}` : ''}` : 'Date not set'
  : `${sessionInfo(l.session)?.label ?? 'Session not set'}${guestsLabel(l) ? ` · ${guestsLabel(l)}` : ''}`;

function preview(l: LeadView) {
  if (l.room.last_text) return `${l.room.last_dir === 'OUT' ? 'You: ' : ''}${l.room.last_text}`;
  return `${STATE_EN[l.state as LeadState]} · ${attendance(l)}`;
}

/** Shared loading + filtering for the lead list page and the room sidebar. */
function useLeads() {
  const [leads, setLeads] = useState<LeadView[] | null>(null);
  const [err, setErr] = useState('');
  const [ev, setEv] = useState<EvFilter>(() => { try { return (localStorage.getItem('ws.ev') as EvFilter) || 'ALL'; } catch { return 'ALL'; } });
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const refresh = useCallback(() => {
    api<{ leads: LeadView[] }>('/api/leads').then((r) => { setLeads(r.leads); setErr(''); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => { try { localStorage.setItem('ws.ev', ev); } catch { /* private mode */ } }, [ev]);
  const list = useMemo(() => (leads ?? [])
    .filter((l) => (ev === 'ALL' || l.event === ev) && (!state || l.state === state)
      && (!q || `${l.full_name} ${l.call_name} ${l.phone_e164}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.room.last_at ?? b.updated_at).localeCompare(a.room.last_at ?? a.updated_at)), [leads, ev, q, state]);
  const count = (e: EvFilter) => (leads ?? []).filter((l) => e === 'ALL' || l.event === e).length;
  return { leads, err, list, refresh, ev, setEv, q, setQ, state, setState, count };
}

function EventTabs({ ev, setEv, count, loaded }: { ev: EvFilter; setEv: (e: EvFilter) => void; count: (e: EvFilter) => number; loaded: boolean }) {
  return (
    <div className="segmented flex w-full sm:w-auto">
      {(['ALL', 'ROADSHOW', 'JESSELTON'] as EvFilter[]).map((e) => (
        <button key={e} onClick={() => setEv(e)} aria-pressed={ev === e} className={`seg flex-1 px-3 ${ev === e ? 'seg-on' : ''}`}>
          {e === 'ALL' ? 'All' : e === 'ROADSHOW' ? 'Roadshow' : 'Jesselton'} <span className="tabular-nums text-ink-3">{loaded ? count(e) : ''}</span>
        </button>
      ))}
    </div>
  );
}

function StatusFilter({ state, setState, className = '' }: { state: string; setState: (s: string) => void; className?: string }) {
  return (
    <select className={`input h-9 min-h-9 text-[13px] ${className}`} value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by status">
      <option value="">All statuses</option>
      {Object.entries(STATE_EN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function Empty({ any }: { any: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[15px] font-medium">{any ? 'No matches' : 'No leads yet'}</p>
      <p className="mt-1 text-sm text-ink-3">{any ? 'Try another search or filter.' : 'Add your first lead from Bitrix24.'}</p>
      {!any && <Link to="/leads/new" className="btn-primary mt-4">New lead</Link>}
    </div>
  );
}

/** Full-width lead list: a table on wide screens, compact rows on phones. */
export function LeadsPage() {
  const f = useLeads();
  const nav = useNavigate();
  const waiting = (f.leads ?? []).filter((l) => l.room.last_dir === 'IN').length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">Leads</h1>
          <p className="text-sm text-ink-3">{f.leads ? `${f.leads.length} clients · ${waiting} waiting for your reply` : 'Loading…'}</p>
        </div>
        {f.leads && f.leads.length > 0 && <button className="btn-ghost" onClick={() => exportXlsx(f.leads!)}>Export .xlsx</button>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input className="input h-9 min-h-9 sm:max-w-xs" type="search" placeholder="Search name or phone" value={f.q} onChange={(e) => f.setQ(e.target.value)} aria-label="Search clients" />
        <EventTabs ev={f.ev} setEv={f.setEv} count={f.count} loaded={!!f.leads} />
        <StatusFilter state={f.state} setState={f.setState} className="sm:ml-auto sm:w-48" />
      </div>

      {f.err && <ErrorBox error={f.err} onRetry={f.refresh} />}
      {!f.leads && !f.err && <Loading />}
      {f.leads && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {!f.list.length ? <Empty any={f.leads.length > 0} /> : (
            <table className="w-full table-fixed text-left text-[14px]">
              <thead className="hidden border-b border-line bg-canvas/60 text-[12px] text-ink-3 md:table-header-group">
                <tr>
                  <th className="w-[30%] px-4 py-2.5 font-medium">Client</th>
                  <th className="w-[12%] px-3 py-2.5 font-medium">Event</th>
                  <th className="w-[13%] px-3 py-2.5 font-medium">Status</th>
                  <th className="hidden w-[17%] px-3 py-2.5 font-medium lg:table-cell">Attendance</th>
                  <th className="px-3 py-2.5 font-medium">Last message</th>
                  <th className="w-20 px-4 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {f.list.map((l) => {
                  const w = l.room.last_dir === 'IN';
                  const go = () => nav(`/room/${l.lead_id}`);
                  return (
                    <tr key={l.lead_id} onClick={go} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-canvas">
                      {/* Phone: one rich cell. Tablet and up: real columns. */}
                      <td className="px-4 py-3" colSpan={1}>
                        <Link to={`/room/${l.lead_id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <Avatar name={l.call_name || l.full_name} event={l.event} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className={`truncate ${w ? 'font-semibold' : 'font-medium'}`}>{l.full_name}</span>
                              {w && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Waiting for reply" />}
                            </span>
                            <span className="block truncate text-xs text-ink-3 md:hidden">{preview(l)}</span>
                            <span className="hidden truncate text-xs text-ink-3 md:block">{l.phone_e164 ? `+${l.phone_e164}` : 'No WhatsApp'}</span>
                          </span>
                          <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3 md:hidden">{relTime(l.room.last_at ?? l.created_at)}</span>
                        </Link>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell"><EventChip event={l.event} /></td>
                      <td className="hidden px-3 py-3 md:table-cell"><StateChip state={l.state as LeadState} /></td>
                      <td className="hidden truncate px-3 py-3 text-[13px] text-ink-2 lg:table-cell">{attendance(l)}</td>
                      <td className={`hidden truncate px-3 py-3 text-[13px] md:table-cell ${w ? 'text-ink' : 'text-ink-3'}`}>{l.room.last_text ? preview(l) : '—'}</td>
                      <td className="hidden px-4 py-3 text-right text-[12px] tabular-nums text-ink-3 md:table-cell">{relTime(l.room.last_at ?? l.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/** Conversation workspace: compact client list on the left, the open room on the right. */
export function Workspace() {
  const { id } = useParams();
  const f = useLeads();
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 md:h-[calc(100dvh-3.5rem)] md:border-x md:border-line">
      <aside className="hidden flex-col bg-surface md:flex md:w-[300px] md:shrink-0 md:border-r md:border-line lg:w-[340px]">
        <div className="space-y-2.5 border-b border-line p-3">
          <div className="flex items-center justify-between px-1">
            <Link to="/leads" className="text-[17px] font-semibold">Conversations</Link>
            <Link to="/leads" className="text-[13px] text-accent">All leads</Link>
          </div>
          <input className="input h-9 min-h-9 bg-canvas" type="search" placeholder="Search name or phone" value={f.q} onChange={(e) => f.setQ(e.target.value)} aria-label="Search clients" />
          <EventTabs ev={f.ev} setEv={f.setEv} count={f.count} loaded={!!f.leads} />
          <StatusFilter state={f.state} setState={f.setState} />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {f.err && <div className="p-3"><ErrorBox error={f.err} onRetry={f.refresh} /></div>}
          {!f.leads && !f.err && <div className="p-3"><Loading /></div>}
          {f.leads && !f.list.length && <Empty any={f.leads.length > 0} />}
          <ul>
            {f.list.map((l) => {
              const on = l.lead_id === id;
              const waiting = l.room.last_dir === 'IN';
              return (
                <li key={l.lead_id}>
                  <Link to={`/room/${l.lead_id}`} aria-current={on ? 'page' : undefined}
                    className={`mx-1.5 flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-100 ${on ? 'bg-accent-soft' : 'hover:bg-canvas'}`}>
                    <Avatar name={l.call_name || l.full_name} event={l.event} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`truncate text-[14.5px] ${waiting ? 'font-semibold' : 'font-medium'}`}>{l.full_name}</span>
                        <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-ink-3">{relTime(l.room.last_at ?? l.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <EventDot event={l.event} />
                        <span className={`truncate text-[13px] ${waiting ? 'text-ink' : 'text-ink-3'}`}>{preview(l)}</span>
                        {waiting && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Waiting for reply" />}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      <section className="flex min-h-dvh min-w-0 flex-1 flex-col bg-canvas md:min-h-0">
        <Outlet context={{ refreshList: f.refresh } satisfies WorkspaceCtx} />
      </section>
    </div>
  );
}
