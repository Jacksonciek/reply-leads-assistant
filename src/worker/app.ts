// HTTP API (Hono). Everything under /api requires a session except login.
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z, ZodError } from 'zod';
import { EVENT_CODES, type EventCode } from '../../config/events';
import { TEMPLATE_VARS } from '../../config/templates';
import { FIRST_CASES, REMINDER_CASES, REMINDER_TEMPLATES, resolveCase, sortKey } from '../domain/cases';
import { buildDashboard, roomMeta, sortLeads, type LeadView } from '../domain/dashboard';
import { formatBitrixTitle } from '../domain/bitrix-title';
import { deriveCallName, normalizeGender } from '../domain/names';
import { alsoRegisteredIn, nextMessage, renderForLead } from '../domain/next-message';
import { parseWaPaste } from '../domain/parse-wa-paste';
import { normalizePhone } from '../domain/phone';
import { validateTemplate } from '../domain/templates';
import { dateLabel, wib } from '../domain/time';
import { emptyLead, type Lead, type LeadState, type Message } from '../domain/types';
import type { Suggestion } from '../domain/routing';
import {
  authRequired, clearSessionCookie, makeSession, passwordMatches, rateLimitLogin, requireAuth, setSessionCookie, verifySession,
} from './auth';
import type { Env } from './env';
import { GenerateError, generateReply } from './services/generate';
import type { Services, ServicesFactory } from './services';
import { storeKind } from './services';
import { NotFound } from './services/repo';
import { setupSheet } from './services/setup';

type C = Context<{ Bindings: Env; Variables: { svc: Services } }>;

const err = (c: C, status: number, code: string, message: string) => c.json({ error: { code, message } }, status as 400);

const LeadStateZ = z.enum(['NEW', 'REMINDER', 'DONE']);
const IsoZ = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Tanggal/waktu tidak valid');

const LeadPatchZ = z.object({
  full_name: z.string().max(200),
  call_name: z.string().max(80),
  call_name_ok: z.boolean(),
  gender: z.enum(['Bapak', 'Ibu', '']),
  phone: z.string().max(60),
  email: z.string().max(200),
  source: z.enum(['Agent', 'Meta', 'Website', '']),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  arrival_time: z.string().regex(/^(\d{2}:\d{2})?$/),
  session: z.enum(['S1', 'S2', 'UNDECIDED', 'NONE']),
  info_only: z.boolean(),
  guests: z.number().int().min(1).max(50).nullable(),
  guests_bucket: z.enum(['', '3+', 'unknown']),
  state: LeadStateZ,
  bitrix_status: z.string().max(60),
  notes: z.string().max(2000),
  needs_pa: z.boolean(),
  pa_forwarded: z.boolean(),
  pa_preferred_time: z.string().max(200),
  opt_out: z.boolean(),
  no_whatsapp: z.boolean(),
  needs_attention: z.boolean(),
}).partial();

const NewLeadZ = LeadPatchZ.extend({
  event: z.enum(['ROADSHOW', 'JESSELTON']),
  full_name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().min(6, 'Nomor WhatsApp wajib diisi'),
  last_contacted_at: IsoZ.optional(),
  pasted_history: z.string().max(20000).optional(),
  force: z.boolean().optional(),
});

const MsgInZ = z.object({
  direction: z.enum(['IN', 'OUT']),
  text: z.string().min(1).max(5000),
  sent_at: IsoZ.nullable().optional(),
  source: z.enum(['PASTED', 'TEMPLATE', 'LLM_DRAFT', 'EDITED_DRAFT', 'MANUAL']).optional(),
});

const SuggestionZ = z.object({
  state: LeadStateZ.optional(),
  opt_out: z.boolean().optional(),
  needs_pa: z.boolean().optional(),
  pa_preferred_time: z.string().max(200).optional(),
  needs_attention: z.boolean().optional(),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  arrival_time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  session: z.enum(['S1', 'S2']).optional(),
  guests: z.number().int().min(1).max(50).optional(),
});

/** Apply a validated patch to a lead (derived fields recomputed). */
export function applyPatch(lead: Lead, p: z.infer<typeof LeadPatchZ>): Lead {
  const l = { ...lead };
  if (p.full_name !== undefined && p.full_name !== l.full_name) {
    l.full_name = p.full_name.trim();
    const cn = deriveCallName(l.full_name);
    if (p.call_name === undefined) { l.call_name = cn.callName; l.call_name_needs_review = cn.needsReview; }
    if (cn.agentName) l.agent_name = cn.agentName;
  }
  if (p.call_name !== undefined) { l.call_name = p.call_name.trim(); l.call_name_needs_review = false; }
  if (p.call_name_ok !== undefined) l.call_name_needs_review = !p.call_name_ok;
  if (p.gender !== undefined) l.gender = normalizeGender(p.gender);
  if (p.phone !== undefined) { const ph = normalizePhone(p.phone); l.phone_e164 = ph.phone; l.phone_invalid = ph.invalid; }
  if (p.email !== undefined) l.email = p.email.trim();
  if (p.source !== undefined) l.source = p.source;
  if (p.visit_date !== undefined) { l.visit_date = p.visit_date; l.visit_date_label = p.visit_date ? dateLabel(p.visit_date) : ''; }
  if (p.arrival_time !== undefined) l.arrival_time = p.arrival_time;
  if (p.session !== undefined) l.session = p.session;
  if (p.info_only !== undefined) l.info_only = p.info_only;
  if (p.guests !== undefined) { l.guests = p.guests; if (p.guests != null) l.guests_bucket = ''; }
  if (p.guests_bucket !== undefined) { l.guests_bucket = p.guests_bucket; if (p.guests_bucket === '3+' && (l.guests ?? 0) < 3) l.guests = null; }
  if (p.state !== undefined) l.state = p.state;
  for (const k of ['bitrix_status', 'notes', 'pa_preferred_time'] as const) if (p[k] !== undefined) l[k] = p[k]!;
  for (const k of ['needs_pa', 'pa_forwarded', 'opt_out', 'no_whatsapp', 'needs_attention'] as const) if (p[k] !== undefined) l[k] = p[k]!;
  return l;
}

export function applySuggestion(lead: Lead, s: Suggestion): Lead {
  const p: z.infer<typeof LeadPatchZ> = {};
  if (s.visit_date) p.visit_date = s.visit_date;
  if (s.arrival_time) p.arrival_time = s.arrival_time.padStart(5, '0');
  if (s.session) { p.session = s.session; p.info_only = false; }
  if (s.guests) p.guests = s.guests;
  if (s.state) p.state = s.state;
  if (s.opt_out !== undefined) p.opt_out = s.opt_out;
  if (s.needs_pa !== undefined) p.needs_pa = s.needs_pa;
  if (s.pa_preferred_time) p.pa_preferred_time = s.pa_preferred_time;
  if (s.needs_attention !== undefined) p.needs_attention = s.needs_attention;
  return applyPatch(lead, p);
}

/** State/timestamps after client messages are added to the room. Returns a warning if relevant. */
export function onInbound(lead: Lead, msgs: Message[]): string | null {
  const last = msgs.reduce((m, x) => (x.sent_at > m ? x.sent_at : m), lead.last_inbound_at ?? '');
  lead.last_inbound_at = last || lead.last_inbound_at;
  let warning: string | null = null;
  if (lead.opt_out || lead.no_whatsapp) {
    warning = 'Lead ini sebelumnya ditandai jangan dihubungi / No WhatsApp. Tanda itu dihapus karena klien membalas, periksa isi pesannya.';
    lead.opt_out = false;
    lead.no_whatsapp = false;
  }
  // A client who writes is in contact: move out of NEW.
  if (lead.state === 'NEW') lead.state = 'REMINDER';
  return warning;
}

export function onOutbound(lead: Lead, at: string, templateCode = '') {
  lead.last_outbound_at = at;
  lead.first_sent_at ||= at;
  if (lead.state === 'NEW') lead.state = 'REMINDER';
  if (REMINDER_TEMPLATES.includes(templateCode)) { lead.reminder_count += 1; lead.last_reminder_at = at; }
  if (templateCode) lead.last_template = templateCode;
  // Confirmation is recorded, but the lead stays in Reminder until marked Done (attended).
  if (templateCode.startsWith('KONF-')) lead.confirmed_at = at;
}

function view(l: Lead, all: Message[], now: Date): LeadView {
  const room = roomMeta(all.filter((m) => m.lead_id === l.lead_id));
  const c = resolveCase(l, now);
  return {
    ...l, case: c.code, due: c.due, sort_key: sortKey(l, c, now, room.last_dir === 'IN'), room,
    created_today: !!l.created_at && wib(new Date(l.created_at)).date === wib(now).date,
  };
}

export function createApp(factory: ServicesFactory, clock: () => Date = () => new Date()) {
  const app = new Hono<{ Bindings: Env; Variables: { svc: Services } }>();

  app.use('/api/*', async (c, next) => {
    c.set('svc', factory(c.env));
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
  });

  app.onError((e, c) => {
    if (e instanceof ZodError) return err(c as C, 400, 'validation', e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    if (e instanceof NotFound) return err(c as C, 404, 'not_found', e.message);
    if (e instanceof GenerateError) return err(c as C, 400, e.code, e.message);
    console.error('api error', (e as Error).message.slice(0, 300));
    return err(c as C, 500, 'server', `Terjadi kesalahan: ${(e as Error).message.slice(0, 200)}`);
  });

  // ---------- auth ----------
  app.post('/api/auth/login', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'local';
    if (c.env.KV && !(await rateLimitLogin(c.env.KV, ip))) return err(c as C, 429, 'rate_limited', 'Too many attempts. Try again in 15 minutes.');
    const { password } = z.object({ password: z.string().max(200) }).parse(await c.req.json());
    if (!c.env.SESSION_SECRET || !(await passwordMatches(c.env.SESSION_SECRET, password, c.env.ADMIN_PASSWORD))) {
      return err(c as C, 401, 'bad_password', 'Password salah');
    }
    setSessionCookie(c, await makeSession(c.env.SESSION_SECRET));
    return c.json({ ok: true });
  });
  app.post('/api/auth/logout', (c) => { clearSessionCookie(c); return c.json({ ok: true }); });
  app.get('/api/auth/me', async (c) => {
    if (!authRequired(c.env)) return c.json({ authenticated: true, auth_required: false });
    return c.json({ authenticated: await verifySession(c.env.SESSION_SECRET, getCookie(c, 'sid')), auth_required: true });
  });

  app.use('/api/*', requireAuth);

  // ---------- leads ----------
  const loadAll = async (c: C) => {
    const now = clock();
    const [leads, msgs] = await Promise.all([c.var.svc.repo.leads(now), c.var.svc.repo.allMessages()]);
    return { now, leads, msgs, views: sortLeads(leads.map((l) => view(l, msgs, now))) };
  };

  app.get('/api/dashboard', async (c) => {
    const { now, views } = await loadAll(c as C);
    return c.json({ now: now.toISOString(), leads: views, dashboard: buildDashboard(views, now) });
  });

  app.get('/api/leads', async (c) => {
    const { views } = await loadAll(c as C);
    const { event, state, q } = c.req.query();
    const qq = (q ?? '').toLowerCase();
    return c.json({
      leads: views.filter((l) => (!event || l.event === event) && (!state || l.state === state)
        && (!qq || l.full_name.toLowerCase().includes(qq) || l.call_name.toLowerCase().includes(qq) || l.phone_e164.includes(qq))),
    });
  });

  app.post('/api/leads', async (c) => {
    const svc = (c as C).var.svc;
    const body = NewLeadZ.parse(await c.req.json());
    const now = clock();
    const all = await svc.repo.leads(now);
    const ph = normalizePhone(body.phone);
    const dup = all.find((l) => l.event === body.event && l.phone_e164 === ph.phone);
    if (dup && !body.force) return c.json({ error: { code: 'duplicate', message: `This number is already registered for ${body.event} as ${dup.full_name}`, lead_id: dup.lead_id } }, 409);
    const cn = deriveCallName(body.full_name);
    let lead = emptyLead({
      event: body.event, full_name: body.full_name.trim(), call_name: cn.callName, call_name_needs_review: cn.needsReview,
      agent_name: cn.agentName, source: body.event === 'ROADSHOW' ? 'Agent' : 'Meta', bitrix_status: 'New',
    });
    const { last_contacted_at, pasted_history, force: _f, event: _e, ...patch } = body;
    lead = applyPatch(lead, patch);
    if (body.event === 'JESSELTON') { lead.visit_date = '2026-11-28'; lead.visit_date_label = dateLabel('2026-11-28'); }
    if (lead.state === 'REMINDER') {
      const at = last_contacted_at ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
      lead.first_sent_at = at; lead.last_outbound_at = at;
    }
    await svc.repo.createLeads([lead], now);
    let added: Message[] = [];
    if (pasted_history?.trim()) {
      const settings = await svc.repo.settings();
      const parsed = parseWaPaste(pasted_history, settings.my_whatsapp_name);
      added = await svc.repo.addMessages(parsed.map((m) => ({
        lead_id: lead.lead_id, direction: m.direction, source: m.direction === 'IN' ? 'PASTED' : 'MANUAL', text: m.text,
        template_code: '', sent_at: m.sent_at ?? now.toISOString(),
      })), now);
      const ins = added.filter((m) => m.direction === 'IN');
      const outs = added.filter((m) => m.direction === 'OUT');
      if (outs.length) { const at = outs[outs.length - 1].sent_at; lead.first_sent_at ||= outs[0].sent_at; lead.last_outbound_at = at; }
      if (ins.length) onInbound(lead, ins);
      await svc.repo.saveLead(lead, now);
    }
    return c.json({ lead_id: lead.lead_id, messages_added: added.length });
  });

  app.get('/api/leads/:id', async (c) => {
    const svc = (c as C).var.svc;
    const { now, leads, msgs } = await loadAll(c as C);
    const lead = leads.find((l) => l.lead_id === c.req.param('id'));
    if (!lead) throw new NotFound('Lead not found');
    const [templates, drafts, settings] = await Promise.all([svc.repo.templates(), svc.repo.draftsFor(lead.lead_id), svc.repo.settings()]);
    const events = await svc.repo.events();
    const messages = msgs.filter((m) => m.lead_id === lead.lead_id && !m.deleted).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    return c.json({
      lead: view(lead, msgs, now),
      messages,
      draft: drafts.filter((d) => d.state === 'PENDING').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
      next: nextMessage(lead, leads, templates, now, events),
      contact_name: formatBitrixTitle(lead),
      also_registered: alsoRegisteredIn(lead, leads),
      link_format: settings.link_format,
      poster: events[lead.event].poster_path,
    });
  });

  app.patch('/api/leads/:id', async (c) => {
    const svc = (c as C).var.svc;
    const p = LeadPatchZ.parse(await c.req.json());
    const now = clock();
    const lead = applyPatch(await svc.repo.lead(c.req.param('id'), now), p);
    await svc.repo.saveLead(lead, now);
    return c.json({ lead });
  });

  app.get('/api/leads/:id/next-message', async (c) => {
    const svc = (c as C).var.svc;
    const now = clock();
    const leads = await svc.repo.leads(now);
    const lead = leads.find((l) => l.lead_id === c.req.param('id'));
    if (!lead) throw new NotFound('Lead not found');
    return c.json(nextMessage(lead, leads, await svc.repo.templates(), now, await svc.repo.events()));
  });

  app.get('/api/leads/:id/render/:code', async (c) => {
    const svc = (c as C).var.svc;
    const now = clock();
    const lead = await svc.repo.lead(c.req.param('id'), now);
    return c.json(renderForLead(c.req.param('code'), lead, await svc.repo.templates(), now, await svc.repo.events()));
  });

  app.post('/api/leads/:id/messages', async (c) => {
    const svc = (c as C).var.svc;
    const { messages } = z.object({ messages: z.array(MsgInZ).min(1).max(200) }).parse(await c.req.json());
    const now = clock();
    const lead = await svc.repo.lead(c.req.param('id'), now);
    // Pasted chats without timestamps: 1 ms apart so they keep the pasted order.
    const added = await svc.repo.addMessages(messages.map((m, i) => ({
      lead_id: lead.lead_id, direction: m.direction, source: m.source ?? (m.direction === 'IN' ? 'PASTED' : 'MANUAL'),
      text: m.text.trim(), template_code: '', sent_at: m.sent_at ?? new Date(now.getTime() + i).toISOString(),
    })), now);
    const outs = added.filter((m) => m.direction === 'OUT');
    for (const o of outs) onOutbound(lead, o.sent_at);
    const ins = added.filter((m) => m.direction === 'IN');
    const warning = ins.length ? onInbound(lead, ins) : null;
    await svc.repo.saveLead(lead, now);
    return c.json({ added, warning, lead });
  });

  app.patch('/api/messages/:id', async (c) => {
    const p = z.object({ text: z.string().min(1).max(5000), sent_at: IsoZ, direction: z.enum(['IN', 'OUT']) }).partial().parse(await c.req.json());
    return c.json({ message: await (c as C).var.svc.repo.patchMessage(c.req.param('id'), p) });
  });

  app.delete('/api/messages/:id', async (c) => {
    return c.json({ message: await (c as C).var.svc.repo.patchMessage(c.req.param('id'), { deleted: true }) });
  });

  app.post('/api/leads/:id/mark-sent', async (c) => {
    const svc = (c as C).var.svc;
    const body = z.object({
      text: z.string().min(1).max(5000),
      template_code: z.string().max(40).optional(),
      draft_id: z.string().max(40).optional(),
    }).parse(await c.req.json());
    const now = clock();
    let lead = await svc.repo.lead(c.req.param('id'), now);
    let source: Message['source'] = body.template_code ? 'TEMPLATE' : 'MANUAL';
    let code = body.template_code ?? '';
    if (body.draft_id) {
      const d = await svc.repo.draft(body.draft_id);
      code = d.template_code || code;
      const edited = d.draft_text.trim() !== body.text.trim() || d.flags.split('|').includes('edited');
      source = edited ? 'EDITED_DRAFT' : d.draft_source === 'LLM' ? 'LLM_DRAFT' : 'TEMPLATE';
      // KONF was rendered from extracted data: apply that data when it is sent.
      if (code.startsWith('KONF-') && d.suggestion_json) lead = applySuggestion(lead, JSON.parse(d.suggestion_json));
      await svc.repo.setDraftState(d.draft_id, 'USED');
    }
    const [msg] = await svc.repo.addMessages([{ lead_id: lead.lead_id, direction: 'OUT', source, text: body.text, template_code: code, sent_at: now.toISOString() }], now);
    onOutbound(lead, msg.sent_at, code);
    await svc.repo.saveLead(lead, now);
    return c.json({ message: msg, lead });
  });

  app.post('/api/leads/:id/generate', async (c) => {
    const svc = (c as C).var.svc;
    const { instruction } = z.object({ instruction: z.string().max(500).optional() }).parse(await c.req.json().catch(() => ({})));
    const now = clock();
    const lead = await svc.repo.lead(c.req.param('id'), now);
    const [messages, templates, faqs, settings, events] = await Promise.all([
      svc.repo.messagesFor(lead.lead_id), svc.repo.templates(), svc.repo.faqs(), svc.repo.settings(), svc.repo.events(),
    ]);
    const r = await generateReply({ lead, messages, templates, faqs, events, llm: svc.llm(settings.gemini_model), now, instruction });
    const draft = await svc.repo.addDraft({
      lead_id: lead.lead_id, after_msg_id: r.after_msg_id, intent: r.intent, confidence: String(r.confidence),
      extracted_json: JSON.stringify(r.extracted), flags: [...r.flags, ...r.notes.map((n) => `note:${n}`)].join('|'),
      draft_text: r.draft_text, draft_source: r.draft_source, template_code: r.template_code, original_text: r.original_text,
      reason: r.reason, suggestion_json: JSON.stringify(r.suggestion), instruction: instruction ?? '',
    }, now);
    return c.json({ draft });
  });

  app.post('/api/leads/:id/apply-suggestion', async (c) => {
    const svc = (c as C).var.svc;
    const body = z.object({ suggestion: SuggestionZ.optional(), draft_id: z.string().optional() }).parse(await c.req.json());
    const now = clock();
    let s: Suggestion = body.suggestion ?? {};
    if (!body.suggestion && body.draft_id) s = JSON.parse((await svc.repo.draft(body.draft_id)).suggestion_json || '{}');
    const lead = applySuggestion(await svc.repo.lead(c.req.param('id'), now), s);
    await svc.repo.saveLead(lead, now);
    return c.json({ lead });
  });

  app.patch('/api/drafts/:id', async (c) => {
    const { draft_text } = z.object({ draft_text: z.string().max(5000) }).parse(await c.req.json());
    const svc = (c as C).var.svc;
    await svc.repo.setDraftText(c.req.param('id'), draft_text);
    return c.json({ draft: await svc.repo.draft(c.req.param('id')) });
  });

  app.post('/api/drafts/:id/discard', async (c) => {
    await (c as C).var.svc.repo.setDraftState(c.req.param('id'), 'DISCARDED');
    return c.json({ ok: true });
  });

  // ---------- bulk generator ----------
  app.get('/api/bulk', async (c) => {
    const svc = (c as C).var.svc;
    const { kind = 'first', event } = c.req.query();
    const now = clock();
    const [leads, msgs, templates, events, settings] = await Promise.all([
      svc.repo.leads(now), svc.repo.allMessages(), svc.repo.templates(), svc.repo.events(), svc.repo.settings(),
    ]);
    const items = leads.filter((l) => (!event || event === 'ALL' || l.event === event)).map((l) => {
      const n = nextMessage(l, leads, templates, now, events);
      return { lead: view(l, msgs, now), next: n, contact_name: formatBitrixTitle(l) };
    }).filter(({ lead: l, next }) => {
      if (!next.template_code) return false;
      if (kind === 'first') return FIRST_CASES.includes(next.case.code);
      if (kind === 'reminder') return REMINDER_CASES.includes(next.case.code) && next.case.due;
      return false;
    }).sort((a, b) => a.lead.sort_key.localeCompare(b.lead.sort_key));
    return c.json({ items, link_format: settings.link_format });
  });

  // ---------- import ----------
  app.post('/api/import/commit', async (c) => {
    const svc = (c as C).var.svc;
    const body = z.object({ mode: z.enum(['skip', 'update']), leads: z.array(z.record(z.string(), z.unknown())).max(2000) }).parse(await c.req.json());
    const now = clock();
    const existing = await svc.repo.leads(now);
    const toCreate: Lead[] = [];
    let updated = 0, skipped = 0;
    for (const raw of body.leads) {
      const l = { ...emptyLead(), ...(raw as Partial<Lead>), lead_id: '' } as Lead;
      if (!EVENT_CODES.includes(l.event)) continue;
      const dup = existing.find((e) => e.event === l.event && e.phone_e164 === l.phone_e164 && !!l.phone_e164);
      if (dup) {
        if (body.mode === 'skip') { skipped++; continue; }
        const merged: Lead = { ...dup, full_name: l.full_name, gender: l.gender, email: l.email, visit_date: l.visit_date, visit_date_label: l.visit_date_label,
          session: l.session, info_only: l.info_only, guests: l.guests, guests_bucket: l.guests_bucket, state: l.state, bitrix_status: l.bitrix_status, source: l.source };
        await svc.repo.saveLead(merged, now);
        updated++;
      } else toCreate.push(l);
    }
    await svc.repo.createLeads(toCreate, now);
    return c.json({ created: toCreate.length, updated, skipped });
  });

  // ---------- templates / faq / config ----------
  app.get('/api/templates', async (c) => c.json({ templates: Object.values(await (c as C).var.svc.repo.templates()), vars: TEMPLATE_VARS }));

  app.put('/api/templates', async (c) => {
    const body = z.object({ code: z.string().min(1).max(40), body: z.string().min(1).max(5000), status: z.enum(['APPROVED', 'NEW_NEEDS_REVIEW']), event: z.string().max(20) }).parse(await c.req.json());
    const errors = validateTemplate(body.body);
    if (errors.length) return err(c as C, 400, 'invalid_template', errors.join('; '));
    await (c as C).var.svc.repo.saveTemplate(body.code, body.body, body.status, body.event, clock());
    return c.json({ ok: true });
  });

  app.get('/api/faq', async (c) => c.json({ faq: await (c as C).var.svc.repo.faqs() }));
  app.put('/api/faq', async (c) => {
    const f = z.object({ faq_id: z.string().optional(), event: z.enum(['ROADSHOW', 'JESSELTON', 'ALL']), question: z.string().min(1).max(500), answer: z.string().min(1).max(2000), approved: z.boolean() }).parse(await c.req.json());
    return c.json({ faq: await (c as C).var.svc.repo.saveFaq(f, clock()) });
  });

  app.get('/api/config', async (c) => {
    const svc = (c as C).var.svc;
    const s = await svc.repo.settings();
    return c.json({ config: s.raw, env: { GEMINI_MODEL: c.env.GEMINI_MODEL ?? '', GEMINI_FALLBACK_MODEL: c.env.GEMINI_FALLBACK_MODEL ?? '', store: storeKind(c.env), gemini_configured: !!c.env.GEMINI_API_KEY } });
  });
  app.put('/api/config', async (c) => {
    const values = z.record(z.string().max(80), z.string().max(500)).parse(await c.req.json());
    await (c as C).var.svc.repo.saveConfig(values);
    return c.json({ ok: true });
  });

  // ---------- setup / health ----------
  app.post('/api/setup', async (c) => c.json({ log: await setupSheet((c as C).var.svc.store, clock()) }));

  app.post('/api/health/sheets', async (c) => {
    try {
      const leads = await (c as C).var.svc.repo.leads(clock());
      return c.json({ ok: true, message: `Connected. ${leads.length} leads read.` });
    } catch (e) {
      return c.json({ ok: false, message: (e as Error).message.slice(0, 300) });
    }
  });

  app.post('/api/health/gemini', async (c) => {
    const svc = (c as C).var.svc;
    const llm = svc.llm((await svc.repo.settings()).gemini_model);
    if (!llm) return c.json({ ok: false, message: 'GEMINI_API_KEY is not set' });
    try {
      const models = (await llm.listModels?.()) ?? [];
      const want = (await svc.repo.settings()).gemini_model || c.env.GEMINI_MODEL || '';
      return c.json({ ok: true, message: `Connected. Model "${want}" ${models.includes(want) ? 'tersedia' : 'TIDAK ditemukan di daftar model'}.`, models: models.filter((m) => /gemini/.test(m)).slice(0, 40) });
    } catch (e) {
      return c.json({ ok: false, message: (e as Error).message.slice(0, 300) });
    }
  });

  app.all('/api/*', (c) => err(c as C, 404, 'not_found', 'Endpoint not found'));

  return app;
}

export type { EventCode, LeadState };
