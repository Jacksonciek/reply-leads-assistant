// Worker integration: auth, room flow, manual sheet edits, import. Sheets and Gemini are mocked.
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/worker/app';
import type { Env } from '../src/worker/env';
import type { LlmClient, LlmOutput } from '../src/worker/services/llm';
import { Repo } from '../src/worker/services/repo';
import { setupSheet } from '../src/worker/services/setup';
import { MemoryStore } from '../src/worker/services/store';
import { hasExcel, loadExcel } from './helpers';

class FakeKV {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async put(k: string, v: string) { this.m.set(k, v); }
  async delete(k: string) { this.m.delete(k); }
}

const NOW = new Date('2026-11-20T03:00:00Z'); // Jumat 20 Nov 10.00 WIB

function setup(llmOut?: Partial<LlmOutput>, now: Date = NOW) {
  const store = new MemoryStore();
  const calls: string[] = [];
  const llm: LlmClient = {
    async classify(_s, u) {
      calls.push(u);
      return { intent: 'OTHER', confidence: 0.9, language: 'id', sentiment: 'neutral', answer_in_kb: true, reason: 'ok', draft: 'Baik, Bapak Bolon 😊', extracted: { visit_date: null, arrival_time: null, session: null, guests: null, pa_preferred_time: null }, model: 'fake', ...llmOut } as LlmOutput & { model: string };
    },
  };
  const app = createApp(() => ({ store, repo: new Repo(store), llm: () => llm }), () => now);
  const env = { KV: new FakeKV() as unknown as KVNamespace, ADMIN_PASSWORD: 'rahasia', REQUIRE_PASSWORD: 'true', SESSION_SECRET: 's'.repeat(40) } as Env;
  let cookie = '';
  const req = async (method: string, path: string, body?: unknown, ip = '1.1.1.1') => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie, 'cf-connecting-ip': ip }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, json: (await res.json()) as any };
  };
  return { store, req, calls, login: () => req('POST', '/api/auth/login', { password: 'rahasia' }) };
}

describe('auth', () => {
  it('rejects without session, wrong password, then accepts', async () => {
    const t = setup();
    expect((await t.req('GET', '/api/config')).status).toBe(401);
    expect((await t.req('POST', '/api/auth/login', { password: 'salah' })).status).toBe(401);
    expect((await t.login()).status).toBe(200);
    expect((await t.req('GET', '/api/config')).status).toBe(200);
    expect((await t.req('GET', '/api/auth/me')).json.authenticated).toBe(true);
  });
  it('viewer (no session) can only read dashboard, leads and one chat', async () => {
    const t = setup();
    expect((await t.req('GET', '/api/dashboard')).status).toBe(200);
    expect((await t.req('GET', '/api/leads')).status).toBe(200);
    expect((await t.req('GET', '/api/leads/ABC123')).status).toBe(404); // allowed, just not found
    for (const [m, p] of [['POST', '/api/leads'], ['PATCH', '/api/leads/ABC123'], ['POST', '/api/leads/ABC123/mark-sent'], ['POST', '/api/leads/ABC123/generate'],
      ['PUT', '/api/leads/ABC123/whatsapp'], ['GET', '/api/config'], ['GET', '/api/templates'], ['GET', '/api/faq'], ['GET', '/api/leads/ABC123/render/B6'], ['POST', '/api/import/commit']] as const) {
      expect((await t.req(m, p, m === 'GET' ? undefined : {})).status, `${m} ${p}`).toBe(401);
    }
  });
  it('rate limits 5 attempts per IP', async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) await t.req('POST', '/api/auth/login', { password: 'x' }, '9.9.9.9');
    expect((await t.req('POST', '/api/auth/login', { password: 'rahasia' }, '9.9.9.9')).status).toBe(429);
    expect((await t.req('POST', '/api/auth/login', { password: 'rahasia' }, '8.8.8.8')).status).toBe(200);
  });
});

describe('room flow', () => {
  it('new lead -> first message -> sent -> paste -> draft KONF -> confirmed', async () => {
    const t = setup({ intent: 'CONFIRM_ATTEND', extracted: { visit_date: null, arrival_time: null, session: 'S2', guests: 2, pa_preferred_time: null } });
    await t.login();
    await setupSheet(t.store, NOW);
    const created = await t.req('POST', '/api/leads', { event: 'JESSELTON', full_name: 'Bolon Parson', gender: 'Bapak', phone: '0812-0000-1111', source: 'Meta', state: 'NEW', session: 'S2', guests: 1, guests_bucket: '' });
    expect(created.status).toBe(200);
    const id = created.json.lead_id;

    const dup = await t.req('POST', '/api/leads', { event: 'JESSELTON', full_name: 'X', phone: '6281200001111', state: 'NEW' });
    expect(dup.status).toBe(409);
    expect(dup.json.error.lead_id).toBe(id);

    let room = await t.req('GET', `/api/leads/${id}`);
    expect(room.json.next.template_code).toBe('B1');
    expect(room.json.next.text).toMatch(/^Selamat pagi, Bapak Bolon 😊/);
    expect(room.json.contact_name).toBe('Bolon Parson | Jesselton Courtyard - Meta | 28/11');

    await t.req('POST', `/api/leads/${id}/mark-sent`, { text: room.json.next.text, template_code: 'B1' });
    room = await t.req('GET', `/api/leads/${id}`);
    expect(room.json.lead.state).toBe('REMINDER');
    expect(room.json.messages).toHaveLength(1);
    expect(t.store.tabs['Jesselton'][1][t.store.tabs['Jesselton'][0].indexOf('Status')]).toBe('Reminder');

    const pasted = await t.req('POST', `/api/leads/${id}/messages`, { messages: [{ direction: 'IN', text: 'Hadir, saya datang ber-2 yang jam 3' }] });
    expect(pasted.json.lead.state).toBe('REMINDER');

    const gen = await t.req('POST', `/api/leads/${id}/generate`, {});
    expect(gen.json.draft.template_code).toBe('KONF-B');
    expect(gen.json.draft.draft_text).toContain('👥 Jumlah tamu: *2 orang*');
    // State is not changed by generating.
    expect((await t.req('GET', `/api/leads/${id}`)).json.lead.state).toBe('REMINDER');

    // Draft edits persist without marking anything as sent.
    const edited = gen.json.draft.draft_text + '\nSampai jumpa.';
    await t.req('PATCH', `/api/drafts/${gen.json.draft.draft_id}`, { draft_text: edited });
    const saved = (await t.req('GET', `/api/leads/${id}`)).json;
    expect(saved.draft.draft_text).toBe(edited);
    expect(saved.messages).toHaveLength(2);
    expect(saved.lead.room.last_text).toContain('Hadir');
    await t.req('PATCH', `/api/drafts/${gen.json.draft.draft_id}`, { draft_text: gen.json.draft.draft_text });

    await t.req('POST', `/api/leads/${id}/mark-sent`, { text: gen.json.draft.draft_text, draft_id: gen.json.draft.draft_id });
    room = await t.req('GET', `/api/leads/${id}`);
    // KONF records the confirmation; the lead stays in Reminder until it is marked Done (attended).
    expect(room.json.lead).toMatchObject({ state: 'REMINDER', session: 'S2', guests: 2 });
    expect(room.json.lead.confirmed_at).toBeTruthy();
    expect(room.json.messages.map((m: any) => m.direction)).toEqual(['OUT', 'IN', 'OUT']);
    expect(room.json.messages[2].source).toBe('EDITED_DRAFT');
    expect(room.json.draft).toBeNull();
    // The LLM payload contained no phone number.
    expect(t.calls.join()).not.toContain('6281200001111');
  });

  it('decline suggestion only applies on click', async () => {
    const t = setup({ intent: 'DECLINE' });
    await t.login();
    const { json } = await t.req('POST', '/api/leads', { event: 'ROADSHOW', full_name: 'Deny Abdi', gender: 'Bapak', phone: '081211112222', state: 'REMINDER' });
    await t.req('POST', `/api/leads/${json.lead_id}/messages`, { messages: [{ direction: 'IN', text: 'maaf tidak bisa datang' }] });
    const gen = await t.req('POST', `/api/leads/${json.lead_id}/generate`, {});
    expect(gen.json.draft.template_code).toBe('DECLINE');
    expect((await t.req('GET', `/api/leads/${json.lead_id}`)).json.lead.opt_out).toBe(false);
    await t.req('POST', `/api/leads/${json.lead_id}/apply-suggestion`, { draft_id: gen.json.draft.draft_id });
    expect((await t.req('GET', `/api/leads/${json.lead_id}`)).json.lead).toMatchObject({ state: 'REMINDER', opt_out: true, case: 'X' });
  });

  it('message edit and soft delete', async () => {
    const t = setup();
    await t.login();
    const { json } = await t.req('POST', '/api/leads', { event: 'ROADSHOW', full_name: 'Ella Hariyanti', gender: 'Ibu', phone: '081233334444', state: 'REMINDER', pasted_history: '[19/11/26 09.12.33] Jackson: Selamat pagi\n[19/11/26 09.30.00] Ella: siap bu' });
    expect(json.messages_added).toBe(2);
    let room = await t.req('GET', `/api/leads/${json.lead_id}`);
    expect(room.json.messages.map((m: any) => m.direction)).toEqual(['OUT', 'IN']);
    await t.req('PATCH', `/api/messages/${room.json.messages[1].msg_id}`, { text: 'siap pak' });
    await t.req('DELETE', `/api/messages/${room.json.messages[0].msg_id}`);
    room = await t.req('GET', `/api/leads/${json.lead_id}`);
    expect(room.json.messages.map((m: any) => m.text)).toEqual(['siap pak']);
  });

  it('WhatsApp sync replaces the chat from its first message on, keeps older app messages as archive', async () => {
    const t = setup();
    await t.login();
    const { json } = await t.req('POST', '/api/leads', { event: 'ROADSHOW', full_name: 'Ella Hariyanti', gender: 'Ibu', phone: '081233334444', state: 'REMINDER', pasted_history: '[17/11/26 09.00.00] Jackson: Halo lama\n[19/11/26 09.12.33] Jackson: Selamat pagi' });
    const wa = [
      { direction: 'OUT', text: 'Selamat pagi, Ibu', sent_at: '2026-11-19T02:12:00Z' },
      { direction: 'IN', text: 'siap bu', sent_at: '2026-11-19T02:30:00Z' },
    ];
    await t.req('PUT', `/api/leads/${json.lead_id}/whatsapp`, { messages: wa });
    await t.req('PUT', `/api/leads/${json.lead_id}/whatsapp`, { messages: wa }); // re-sync does not duplicate
    const room = (await t.req('GET', `/api/leads/${json.lead_id}`)).json;
    expect(room.messages.map((m: any) => [m.source, m.text])).toEqual([['MANUAL', 'Halo lama'], ['WHATSAPP', 'Selamat pagi, Ibu'], ['WHATSAPP', 'siap bu']]);
    expect(room.lead.last_inbound_at).toBe('2026-11-19T02:30:00.000Z');
  });

  it('import (update) follows the Excel: name, notes and row number; status fields stay', async () => {
    const t = setup();
    await t.login();
    const { json } = await t.req('POST', '/api/leads', { event: 'ROADSHOW', full_name: 'Old Name', gender: 'Ibu', phone: '081233334444', state: 'REMINDER' });
    await t.req('PATCH', `/api/leads/${json.lead_id}`, { wa_status: 'CONFIRMED', next_step: 'Reminder H-1' });
    const excel = { event: 'ROADSHOW', full_name: 'New Name', gender: 'Ibu', phone_e164: '6281233334444', no: 7, notes: 'Reminder H-1', state: 'NEW', bitrix_status: 'Following up' };
    expect((await t.req('POST', '/api/import/commit', { mode: 'update', leads: [excel] })).json.updated).toBe(1);
    const lead = (await t.req('GET', `/api/leads/${json.lead_id}`)).json.lead;
    expect(lead).toMatchObject({ full_name: 'New Name', notes: 'Reminder H-1', no: 7, state: 'REMINDER', wa_status: 'CONFIRMED', next_step: 'Reminder H-1' });
  });
});

describe('migration to New / Reminder / Done', () => {
  it('old status labels are rewritten to Reminder on first read, keeping No WhatsApp / opt-out as flags', async () => {
    const t = setup(undefined, new Date('2026-11-23T02:00:00Z'));
    await t.login();
    await setupSheet(t.store, NOW);
    const head = t.store.tabs['Roadshow'][0];
    const mk = (name: string, phone: string, status: string) => head.map((h) => ({ Name: name, Gender: 'Ibu', 'Phone number': phone, Date: 'Belum pasti', Status: status } as Record<string, string>)[h] ?? '');
    t.store.tabs['Roadshow'].push(mk('Ani A', '6281200000011', 'Belum chat'), mk('Bea B', '6281200000012', 'Belum balas'), mk('Cici C', '6281200000013', 'No WhatsApp'), mk('Dina D', '6281200000014', 'Opt-out'));
    const { json } = await t.req('GET', '/api/leads');
    const by = Object.fromEntries(json.leads.map((l: any) => [l.full_name, l]));
    expect(Object.values(by).map((l: any) => l.state)).toEqual(['REMINDER', 'REMINDER', 'REMINDER', 'REMINDER']);
    expect(by['Ani A']).toMatchObject({ case: 'A3', due: true });
    expect(by['Cici C']).toMatchObject({ no_whatsapp: true, case: 'X' });
    expect(by['Dina D']).toMatchObject({ opt_out: true, case: 'X' });
    const col = (c: string) => head.indexOf(c) >= 0 ? head.indexOf(c) : t.store.tabs['Roadshow'][0].indexOf(c);
    expect(t.store.tabs['Roadshow'].slice(1, 5).map((r) => r[col('Status')])).toEqual(['Reminder', 'Reminder', 'Reminder', 'Reminder']);
    // A second read keeps the flags (they now live in their own columns).
    const again = (await t.req('GET', '/api/leads')).json.leads;
    expect(again.find((l: any) => l.full_name === 'Cici C').no_whatsapp).toBe(true);
    expect(again.find((l: any) => l.full_name === 'Dina D').opt_out).toBe(true);
  });
});

describe('manual sheet edits', () => {
  it('row added by hand gets lead_id and call name; Status edit drives state', async () => {
    const t = setup();
    await t.login();
    await setupSheet(t.store, NOW);
    const head = t.store.tabs['Roadshow'][0];
    const row = head.map((h) => ({ Name: 'Muhammad Rusdi (Daniel Tan)', Gender: 'Bapak', 'Phone number': 'wa.me/6281299998888\n', Date: 'Rabu, 25 November 2026', Status: 'New' } as Record<string, string>)[h] ?? '');
    t.store.tabs['Roadshow'].push(row, head.map(() => ''));
    const { json } = await t.req('GET', '/api/leads');
    expect(json.leads).toHaveLength(1);
    const l = json.leads[0];
    expect(l).toMatchObject({ call_name: 'Rusdi', agent_name: 'Daniel Tan', case: 'A1', visit_date: '2026-11-25' });
    expect(t.store.tabs['Roadshow'][1][head.indexOf('lead_id')]).toBe(l.lead_id);
    expect(t.store.tabs['Roadshow'][1][head.indexOf('Nama Sapaan')]).toBe('Rusdi');
    t.store.tabs['Roadshow'][1][head.indexOf('Status')] = 'Opt-out';
    const again = await t.req('GET', '/api/dashboard');
    expect(again.json.leads[0]).toMatchObject({ state: 'REMINDER', opt_out: true });
    expect(again.json.dashboard.first_messages).toHaveLength(0);
  });
});

describe.skipIf(!hasExcel)('import real Excel', () => {
  it('imports all leads and the cases match the acceptance table', async () => {
    const t = setup();
    await t.login();
    const data = loadExcel();
    const leads = [...data.roadshow, ...data.jesselton].map((r) => r.lead);
    const r = await t.req('POST', '/api/import/commit', { mode: 'skip', leads });
    expect(r.json).toEqual({ created: 39, updated: 0, skipped: 0 });
    expect((await t.req('POST', '/api/import/commit', { mode: 'skip', leads })).json.skipped).toBe(39);
    const { json } = await t.req('GET', '/api/leads');
    const byName = Object.fromEntries(json.leads.map((l: any) => [l.full_name, l.case]));
    expect(byName['Ruslan Sinuhaji']).toBe('A1');
    expect(byName['Partahi Silitonga']).toBe('CONV');
    expect(byName['Bolon Parson']).toBe('B1');
    expect(byName['Rohman Romi']).toBe('B5');
    const dash = (await t.req('GET', '/api/dashboard')).json.dashboard;
    expect(dash.unanswered.find((x: any) => x.reason === 'Paste the latest chat')).toBeTruthy();
  });
});
