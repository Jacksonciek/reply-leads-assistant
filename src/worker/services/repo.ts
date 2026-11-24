// Typed access to the spreadsheet: leads per event tab, messages, drafts, FAQ, templates, config.
import { EVENTS, EVENT_CODES, resolveEvents, type EventCode, type EventConfig } from '../../../config/events';
import { DEFAULT_TEMPLATES } from '../../../config/templates';
import { resolveCase } from '../../domain/cases';
import { isLeadRow, leadColumns, leadToRow, rowToLead } from '../../domain/sheet-row';
import type { TemplateMap } from '../../domain/templates';
import {
  CONFIG_COLUMNS, DRAFT_COLUMNS, FAQ_COLUMNS, MESSAGE_COLUMNS, STATE_LABEL, TEMPLATE_COLUMNS,
  type Draft, type Faq, type Lead, type Message,
} from '../../domain/types';
import { ObjTable, type Obj, type Store } from './store';
import { ulid } from './ulid';

export const CONFIG_DEFAULTS: Record<string, string> = {
  my_whatsapp_name: 'Jackson',
  link_format: 'wa.me',
  gemini_model: '',
  'event.ROADSHOW.team_name': EVENTS.ROADSHOW.team_name,
  'event.ROADSHOW.display_name': EVENTS.ROADSHOW.display_name,
  'event.ROADSHOW.short_name': EVENTS.ROADSHOW.short_name,
  'event.ROADSHOW.opening_hours': '',
};

export interface Settings {
  my_whatsapp_name: string;
  link_format: 'wa.me' | 'android_business';
  gemini_model: string;
  raw: Record<string, string>;
}

export class NotFound extends Error {}

export class Repo {
  messages: ObjTable;
  drafts: ObjTable;
  faq: ObjTable;
  templatesT: ObjTable;
  config: ObjTable;

  constructor(private store: Store) {
    this.messages = new ObjTable(store, 'Messages', MESSAGE_COLUMNS);
    this.drafts = new ObjTable(store, 'Drafts', DRAFT_COLUMNS);
    this.faq = new ObjTable(store, 'FAQ', FAQ_COLUMNS);
    this.templatesT = new ObjTable(store, 'Templates', TEMPLATE_COLUMNS);
    this.config = new ObjTable(store, 'Config', CONFIG_COLUMNS);
  }

  private leadTable(ev: EventCode) { return new ObjTable(this.store, EVENTS[ev].sheet_tab, leadColumns(ev)); }

  // ---------- leads ----------

  /** Read all event tabs. Rows added by hand get a lead_id, call name and system values written back. */
  async leads(now = new Date()): Promise<Lead[]> {
    const out: Lead[] = [];
    for (const ev of EVENT_CODES) {
      const t = this.leadTable(ev);
      const { header, rows } = await t.load();
      // A tab made by hand (e.g. from an Excel upload) lacks the system columns. Add them at the end,
      // otherwise generated lead_ids can't be saved and change on every read ("Lead not found").
      const missingCols = leadColumns(ev).filter((c) => !header.includes(c));
      if (missingCols.length && rows.length) {
        await this.store.write(EVENTS[ev].sheet_tab, [{ row: 1, col: header.length + 1, values: missingCols }]);
        header.push(...missingCols);
      }
      const fixes = new Map<number, Obj>();
      for (const { row, obj } of rows) {
        if (!isLeadRow(obj)) continue;
        const lead = rowToLead(ev, obj);
        const fix: Obj = {};
        if (!lead.lead_id) { lead.lead_id = ulid(); fix.lead_id = lead.lead_id; }
        if (!lead.created_at) { lead.created_at = now.toISOString(); fix.created_at = lead.created_at; }
        if (!obj['Nama Sapaan']?.trim() && lead.call_name) fix['Nama Sapaan'] = lead.call_name;
        if (obj['phone_e164'] !== lead.phone_e164) fix.phone_e164 = lead.phone_e164;
        if (obj['state'] !== lead.state) fix.state = lead.state;
        // One-time move of old status labels to New/Reminder/Done; keep what the old label meant as flags.
        if (obj['Status'] !== STATE_LABEL[lead.state]) {
          fix.Status = STATE_LABEL[lead.state];
          fix.opt_out = lead.opt_out ? 'TRUE' : 'FALSE';
          fix.no_whatsapp = lead.no_whatsapp ? 'TRUE' : 'FALSE';
        }
        if (!obj['agent_name'] && lead.agent_name) fix.agent_name = lead.agent_name;
        lead.case_code = resolveCase(lead, now).code;
        if (obj['case_code'] !== lead.case_code) fix.case_code = lead.case_code;
        if (Object.keys(fix).length) fixes.set(row, fix);
        out.push(lead);
      }
      if (fixes.size) {
        const updates = [...fixes].flatMap(([row, fix]) => Object.entries(fix).map(([k, v]) => {
          const col = header.indexOf(k);
          return col < 0 ? null : { row, col: col + 1, values: [v] };
        }).filter((u): u is { row: number; col: number; values: string[] } => !!u));
        await this.store.write(EVENTS[ev].sheet_tab, updates);
      }
    }
    return out;
  }

  async lead(id: string, now = new Date()): Promise<Lead> {
    const l = (await this.leads(now)).find((x) => x.lead_id === id);
    if (!l) throw new NotFound('Lead not found');
    return l;
  }

  async saveLead(lead: Lead, now = new Date()): Promise<Lead> {
    lead.updated_at = now.toISOString();
    lead.case_code = resolveCase(lead, now).code;
    const t = this.leadTable(lead.event);
    const { header, rows } = await t.load();
    const hit = rows.find((r) => r.obj['lead_id'] === lead.lead_id);
    if (!hit) throw new NotFound('Lead row not found in the sheet (maybe deleted)');
    const merged = { ...hit.obj, ...leadToRow(lead, lead.no || undefined) };
    await this.store.write(EVENTS[lead.event].sheet_tab, [{ row: hit.row, col: 1, values: header.map((h) => merged[h] ?? '') }]);
    return lead;
  }

  async createLeads(leads: Lead[], now = new Date()): Promise<Lead[]> {
    for (const ev of EVENT_CODES) {
      const batch = leads.filter((l) => l.event === ev);
      if (!batch.length) continue;
      const t = this.leadTable(ev);
      const { header, rows } = await t.load();
      let no = rows.reduce((m, r) => Math.max(m, Number(r.obj['No']) || 0), 0);
      const values = batch.map((l) => {
        l.lead_id ||= ulid();
        l.created_at ||= now.toISOString();
        l.updated_at = now.toISOString();
        l.case_code = resolveCase(l, now).code;
        // Keep the Excel row number when the lead comes from the Excel file; new leads go to the bottom.
        l.no = l.no || ++no;
        no = Math.max(no, l.no);
        const r = leadToRow(l, l.no);
        return header.map((h) => r[h] ?? '');
      });
      await this.store.append(EVENTS[ev].sheet_tab, values);
    }
    return leads;
  }

  // ---------- messages ----------

  async allMessages(): Promise<Message[]> {
    return (await this.messages.all()).map(toMessage);
  }

  async messagesFor(leadId: string): Promise<Message[]> {
    return (await this.allMessages()).filter((m) => m.lead_id === leadId && !m.deleted).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  }

  async addMessages(msgs: Omit<Message, 'msg_id' | 'created_at' | 'deleted'>[], now = new Date()): Promise<Message[]> {
    const full = msgs.map((m) => ({ ...m, msg_id: ulid(), created_at: now.toISOString(), deleted: false }));
    await this.messages.append(full.map((m) => ({ ...m, deleted: 'FALSE' }) as unknown as Obj));
    return full;
  }

  async patchMessage(id: string, patch: Partial<Pick<Message, 'text' | 'sent_at' | 'direction' | 'deleted'>>): Promise<Message> {
    const p: Obj = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) p[k] = typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    const r = await this.messages.update('msg_id', id, p);
    if (!r) throw new NotFound('Message not found');
    return toMessage(r);
  }

  // ---------- drafts ----------

  async draftsFor(leadId: string): Promise<Draft[]> {
    return (await this.drafts.all()).filter((d) => d.lead_id === leadId) as unknown as Draft[];
  }

  async draft(id: string): Promise<Draft> {
    const d = (await this.drafts.all()).find((x) => x.draft_id === id);
    if (!d) throw new NotFound('Draft not found');
    return d as unknown as Draft;
  }

  async addDraft(d: Omit<Draft, 'draft_id' | 'created_at' | 'state'>, now = new Date()): Promise<Draft> {
    // Older pending drafts of this lead are superseded.
    const pending = (await this.draftsFor(d.lead_id)).filter((x) => x.state === 'PENDING');
    await this.drafts.updateMany('draft_id', new Map(pending.map((x) => [x.draft_id, { state: 'DISCARDED' }])));
    const full: Draft = { ...d, draft_id: ulid(), created_at: now.toISOString(), state: 'PENDING' };
    await this.drafts.append([full as unknown as Obj]);
    return full;
  }

  async setDraftText(id: string, draft_text: string): Promise<void> {
    const d = await this.draft(id);
    // Keep a marker so "sent" can still tell the reply was edited by hand.
    const flags = d.flags.split('|').includes('edited') ? d.flags : [d.flags, 'edited'].filter(Boolean).join('|');
    await this.drafts.update('draft_id', id, { draft_text, flags });
  }

  async setDraftState(id: string, state: Draft['state']): Promise<void> {
    await this.drafts.update('draft_id', id, { state });
  }

  // ---------- templates / faq / config ----------

  async templates(): Promise<TemplateMap & Record<string, { event: string; description: string; default_body: string }>> {
    const map: Record<string, any> = {};
    for (const t of DEFAULT_TEMPLATES) map[t.code] = { ...t, default_body: t.body };
    for (const r of await this.templatesT.all()) {
      if (!r.code) continue;
      const base = map[r.code] ?? { code: r.code, kind: 'REPLY', description: '', default_body: '' };
      map[r.code] = { ...base, event: r.event || base.event, body: r.body || base.body, status: r.status === 'APPROVED' ? 'APPROVED' : 'NEW_NEEDS_REVIEW' };
    }
    return map;
  }

  async saveTemplate(code: string, body: string, status: string, event: string, now = new Date()): Promise<void> {
    const patch = { code, body, status, event, updated_at: now.toISOString() };
    if (!(await this.templatesT.update('code', code, patch))) await this.templatesT.append([patch]);
  }

  async faqs(): Promise<Faq[]> {
    return (await this.faq.all()).map((r) => ({
      faq_id: r.faq_id, event: (r.event || 'ALL') as Faq['event'], question: r.question, answer: r.answer,
      approved: /^true$/i.test(r.approved), updated_at: r.updated_at,
    }));
  }

  async saveFaq(f: Omit<Faq, 'faq_id' | 'updated_at'> & { faq_id?: string }, now = new Date()): Promise<Faq> {
    const row = { ...f, faq_id: f.faq_id || ulid(), approved: f.approved ? 'TRUE' : 'FALSE', updated_at: now.toISOString() };
    if (!f.faq_id || !(await this.faq.update('faq_id', f.faq_id, row as Obj))) await this.faq.append([row as Obj]);
    return { ...row, approved: f.approved } as Faq;
  }

  async settings(): Promise<Settings> {
    const raw: Record<string, string> = { ...CONFIG_DEFAULTS };
    for (const r of await this.config.all()) if (r.key) raw[r.key] = r.value ?? '';
    return {
      my_whatsapp_name: raw.my_whatsapp_name || 'Jackson',
      link_format: raw.link_format === 'android_business' ? 'android_business' : 'wa.me',
      gemini_model: raw.gemini_model ?? '',
      raw,
    };
  }

  async saveConfig(values: Record<string, string>): Promise<void> {
    const existing = new Set((await this.config.all()).map((r) => r.key));
    const add: Obj[] = [];
    for (const [key, value] of Object.entries(values)) {
      if (existing.has(key)) await this.config.update('key', key, { key, value });
      else add.push({ key, value });
    }
    await this.config.append(add);
  }

  async events(): Promise<Record<EventCode, EventConfig>> {
    return resolveEvents((await this.settings()).raw);
  }
}

function toMessage(r: Obj): Message {
  return {
    msg_id: r.msg_id, lead_id: r.lead_id, direction: r.direction === 'OUT' ? 'OUT' : 'IN',
    source: (r.source || 'MANUAL') as Message['source'], text: r.text ?? '', template_code: r.template_code ?? '',
    sent_at: r.sent_at || r.created_at, created_at: r.created_at, deleted: /^true$/i.test(r.deleted ?? ''),
  };
}
