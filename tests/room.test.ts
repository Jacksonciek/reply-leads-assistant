// New modules: paste parser, redaction, sheet row sync, CROSS_EVENT, dashboard, guardrail phrases, pipeline.
import { describe, expect, it } from 'vitest';
import { EVENTS } from '../config/events';
import { DEFAULT_TEMPLATES, OPT_OUT_PHRASE_ALLOWED } from '../config/templates';
import { buildDashboard, roomMeta, type LeadView } from '../src/domain/dashboard';
import { checkDraft, fallbackFor } from '../src/domain/guardrails';
import { nextMessage, renderForLead } from '../src/domain/next-message';
import { parseWaPaste } from '../src/domain/parse-wa-paste';
import { redactText } from '../src/domain/redact';
import { leadToRow, rowToLead } from '../src/domain/sheet-row';
import type { TemplateMap } from '../src/domain/templates';
import { dateLabel, fromWib } from '../src/domain/time';
import { emptyLead, type Lead, type Message } from '../src/domain/types';
import { buildLlmPayload, generateReply } from '../src/worker/services/generate';
import type { LlmClient, LlmOutput } from '../src/worker/services/llm';
import { LlmError } from '../src/worker/services/llm';
import { NOW } from './helpers';

const TPL: TemplateMap = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.code, t]));
const jl = (p: Partial<Lead> = {}) => emptyLead({ lead_id: 'J1', event: 'JESSELTON', full_name: 'Bolon Parson', call_name: 'Bolon', gender: 'Bapak', phone_e164: '6281200001111', source: 'Meta', visit_date: '2026-11-28', visit_date_label: dateLabel('2026-11-28'), ...p });
const rl = (p: Partial<Lead> = {}) => emptyLead({ lead_id: 'R1', event: 'ROADSHOW', full_name: 'Anita Zoelisa, S.E. (Calvin Kok)', call_name: 'Anita', agent_name: 'Calvin Kok', gender: 'Ibu', phone_e164: '6281200002222', source: 'Agent', email: 'anita@example.com', ...p });
const msg = (dir: 'IN' | 'OUT', text: string, i = 0): Message => ({ msg_id: `M${i}`, lead_id: 'X', direction: dir, source: 'PASTED', text, template_code: '', sent_at: new Date(NOW.getTime() + i * 60000).toISOString(), created_at: '', deleted: false });

describe('parseWaPaste', () => {
  it('Android export format', () => {
    const r = parseWaPaste('19/11/26 09.12 - Bolon Parson: Hadir\n19/11/26 09.13 - Jackson: Terima kasih Pak\n19/11/26 09.20 - Bolon Parson: sama istri\nyang jam 3', 'Jackson');
    expect(r.map((m) => [m.direction, m.text])).toEqual([['IN', 'Hadir'], ['OUT', 'Terima kasih Pak'], ['IN', 'sama istri\nyang jam 3']]);
    expect(r[0].sent_at).toBe(fromWib('2026-11-19', 9, 12).toISOString());
  });
  it('iOS format with seconds and brackets', () => {
    const r = parseWaPaste('[19/11/26 09.12.33] Bolon Parson: Hadir\n[19/11/26 21.05.01] Jackson Zeon: Baik Pak', 'Jackson');
    expect(r.map((m) => m.direction)).toEqual(['IN', 'OUT']);
    expect(r[1].sent_at).toBe(fromWib('2026-11-19', 21, 5).toISOString());
  });
  it('copied selected messages [time, date] Name:', () => {
    const r = parseWaPaste('[09:12, 19/11/2026] Bolon Parson: Ok, terimakasih pak buk');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ direction: 'IN', text: 'Ok, terimakasih pak buk', sender: 'Bolon Parson' });
  });
  it('AM/PM times', () => {
    const r = parseWaPaste('11/19/26, 3:05 PM - Budi: halo');
    expect(r[0].text).toBe('halo');
  });
  it('plain text without prefix is one client message', () => {
    expect(parseWaPaste('Hadir pak\nsaya berdua')).toEqual([{ direction: 'IN', text: 'Hadir pak\nsaya berdua', sent_at: null, sender: '' }]);
  });
  it('strips invisible marks', () => expect(parseWaPaste('‎[19/11/26 09.12.33] Budi: ‎image omitted')[0].text).toBe('image omitted'));
});

describe('redact', () => {
  it('masks phones and emails', () => {
    const t = redactText('nomor saya 0812-3456-7890 atau +62 812 3456 7890, email budi.s@gmail.com');
    expect(t).not.toMatch(/\d{4}/);
    expect(t).not.toContain('@');
  });
  it('keeps dates, times and small numbers', () => expect(redactText('Sabtu 28/11 jam 15.00 bertiga, lantai 25')).toBe('Sabtu 28/11 jam 15.00 bertiga, lantai 25'));
  it('LLM payload never contains phone, email, full name or agent', () => {
    const lead = rl({ case_code: 'CONV', visit_date: '2026-11-23', visit_date_label: dateLabel('2026-11-23') });
    const messages = [msg('OUT', 'Selamat pagi, Ibu Anita', 0), msg('IN', 'Anita Zoelisa, S.E. (Calvin Kok) di sini, wa saya 081200002222 email anita@example.com', 1)];
    const p = buildLlmPayload(lead, messages, [messages[1]], EVENTS, []);
    const all = p.system + p.user;
    for (const s of ['6281200002222', '081200002222', 'anita@example.com', 'Calvin Kok', 'Zoelisa']) expect(all).not.toContain(s);
    expect(p.user).toContain('"nama":"Anita"');
  });
  it('history limited to 20 messages', () => {
    const many = Array.from({ length: 30 }, (_, i) => msg(i % 2 ? 'IN' : 'OUT', `pesan ${i}`, i));
    const p = buildLlmPayload(rl(), many, [many[29]], EVENTS, []);
    expect(JSON.parse(p.user).riwayat).toHaveLength(20);
  });
});

describe('sheet row sync', () => {
  it('Jesselton round trip keeps attendance data', () => {
    for (const l of [jl({ session: 'S1', guests: 1, guests_bucket: '' }), jl({ session: 'S2', guests: 5, guests_bucket: '' }), jl({ session: 'UNDECIDED', info_only: true, guests: 2, guests_bucket: '' }), jl({ session: 'NONE', info_only: true, guests: null, guests_bucket: 'unknown' }), jl({ session: 'S1', guests: null, guests_bucket: '3+' })]) {
      const back = rowToLead('JESSELTON', leadToRow(l));
      expect([back.session, back.info_only, back.guests, back.guests_bucket]).toEqual([l.session, l.info_only, l.guests, l.guests_bucket]);
    }
  });
  it('Roadshow round trip', () => {
    const l = rl({ visit_date: '2026-11-25', visit_date_label: dateLabel('2026-11-25'), arrival_time: '14:30', state: 'CONFIRMED', needs_pa: true });
    const back = rowToLead('ROADSHOW', leadToRow(l));
    expect([back.visit_date, back.arrival_time, back.state, back.needs_pa, back.agent_name]).toEqual(['2026-11-25', '14:30', 'CONFIRMED', true, 'Calvin Kok']);
  });
  it('manual Status edit is the source of truth', () => {
    const row = leadToRow(rl({ state: 'NEW' }));
    expect(rowToLead('ROADSHOW', { ...row, Status: 'Terkonfirmasi' }).state).toBe('CONFIRMED');
    expect(rowToLead('ROADSHOW', { ...row, Status: 'Opt-out' })).toMatchObject({ state: 'OPTED_OUT', opt_out: true });
  });
  it('manual call name wins; empty is derived', () => {
    const row = leadToRow(rl());
    expect(rowToLead('ROADSHOW', { ...row, 'Nama Sapaan': 'Nita' }).call_name).toBe('Nita');
    expect(rowToLead('ROADSHOW', { ...row, 'Nama Sapaan': '' }).call_name).toBe('Anita');
  });
});

describe('CROSS_EVENT and quick renders', () => {
  const tplApproved: TemplateMap = { ...TPL, 'CROSS_EVENT-B': { ...TPL['CROSS_EVENT-B'], status: 'APPROVED' } };
  it('Roadshow after Jesselton uses the cross intro', () => {
    const j = jl({ phone_e164: '6281299990000', first_sent_at: NOW.toISOString(), state: 'AWAITING_REPLY' });
    const r = rl({ phone_e164: '6281299990000', full_name: 'Turnip Durian', call_name: 'Turnip', gender: 'Bapak', visit_date: null });
    const n = nextMessage(r, [j, r], TPL, NOW);
    expect(n.cross_event).toBe('JESSELTON');
    expect(n.text).toContain('Terima kasih juga sudah mendaftar untuk Medan Property Roadshow, Pak. Acara ini terpisah dari Private Property Preview Jesselton Courtyard');
    expect(n.text).toContain('Bila Bapak sudah memiliki gambaran');
    expect(n.text).not.toContain('Perkenalkan');
    expect(n.warnings.join()).toContain('Also registered for');
  });
  it('Jesselton after Roadshow: unapproved variant falls back with a warning', () => {
    const r = rl({ phone_e164: '6281299990000', first_sent_at: NOW.toISOString(), state: 'AWAITING_REPLY' });
    const j = jl({ phone_e164: '6281299990000', session: 'S1', guests: 1, guests_bucket: '' });
    const n = nextMessage(j, [j, r], TPL, NOW);
    expect(n.cross_event).toBeNull();
    expect(n.text).toContain('Perkenalkan');
    const n2 = nextMessage(j, [j, r], tplApproved, NOW);
    expect(n2.cross_event).toBe('ROADSHOW');
    expect(n2.text).toContain('terpisah dari Medan Property Roadshow di Cambridge City Square');
  });
  it('REMINDER_PA uses relative day and visit day', () => {
    const l = rl({ visit_date: '2026-11-23', visit_date_label: dateLabel('2026-11-23'), last_inbound_at: fromWib('2026-11-18', 15).toISOString(), state: 'REPLIED' });
    const t = renderForLead('REMINDER_PA-A', l, TPL, NOW).text!;
    expect(t).toContain('obrolannya kemarin, Bu');
    expect(t).toContain('sampai bertemu Senin nanti 🙏');
  });
  it('SOFT_CONFIRM never says attendance is recorded', () => {
    const t = renderForLead('SOFT_CONFIRM-B', jl({ session: 'S2', guests: 1, guests_bucket: '' }), TPL, NOW).text!;
    expect(t).toContain('apakah Bapak berkenan hadir di sesi 15.00–17.00 WIB');
    expect(checkDraft(t, { projectLink: EVENTS.JESSELTON.project_link }).flags).not.toContain('attendance_claim');
  });
  it('no template offers to stop contacting, except OPT_OUT and SOURCE', () => {
    for (const t of DEFAULT_TEMPLATES) {
      const flagged = checkDraft(t.body, { allowOptOutPhrase: false, attendanceStated: true }).flags.includes('opt_out_offer');
      if (!OPT_OUT_PHRASE_ALLOWED.includes(t.code)) expect([t.code, flagged]).toEqual([t.code, false]);
    }
  });
});

describe('guardrail phrases', () => {
  const g = (t: string, o = {}) => checkDraft(t, { projectLink: EVENTS.JESSELTON.project_link, ...o }).flags;
  it.each([
    'Jika Bapak lebih nyaman tidak dihubungi lagi, silakan sampaikan', 'Bila tidak ingin dihubungi, kabari saja', 'dengan senang hati saya hormati',
  ])('blocks opt-out offer: %s', (t) => expect(g(t)).toContain('opt_out_offer'));
  it('attendance claim only when not stated', () => {
    expect(g('Baik Pak, kehadiran Bapak sudah kami catat')).toContain('attendance_claim');
    expect(g('Baik Pak, kami catat kehadiran Bapak', { attendanceStated: true })).not.toContain('attendance_claim');
  });
  it('fallbacks', () => {
    expect(fallbackFor(['forbidden:harga'])).toBe('HANDOFF_PA');
    expect(fallbackFor(['link'])).toBe('HOLD');
    expect(fallbackFor(['human_claim'], 'ASK_IF_BOT')).toBe('ASK_IF_BOT');
  });
  it('similar safe words pass', () => expect(g('Terima kasih, kami sangat menghargai waktu Bapak. Semoga beruntung dan leluasa.')).toEqual([]));
});

describe('dashboard', () => {
  const v = (l: Lead, messages: Message[] = []): LeadView => ({ ...l, case: '', room: roomMeta(messages.map((m) => ({ ...m, lead_id: l.lead_id }))) });
  it('queues', () => {
    const a = v(rl({ lead_id: 'a', state: 'REPLIED' }), [msg('OUT', 'x', 0), msg('IN', 'y', 1)]);
    const b = v(rl({ lead_id: 'b', state: 'REPLIED' }));
    const c = v(jl({ lead_id: 'c', state: 'NEW', session: 'S1', guests: 1, guests_bucket: '' }));
    const d = v(rl({ lead_id: 'd', state: 'OPTED_OUT', opt_out: true }), [msg('IN', 'z', 2)]);
    const e = v(rl({ lead_id: 'e', state: 'AWAITING_REPLY', needs_pa: true, call_name_needs_review: true }));
    const dash = buildDashboard([a, b, c, d, e], NOW);
    expect(dash.unanswered.map((x) => [x.lead_id, x.reason])).toEqual([['b', 'Paste the latest chat'], ['a', 'Client message not answered']]);
    expect(dash.first_messages.map((x) => x.lead_id)).toEqual(['c']);
    expect(dash.reminders.map((x) => x.lead_id)).toEqual(['e']);
    expect(dash.pa.map((x) => x.lead_id)).toEqual(['e']);
    expect(dash.name_review.map((x) => x.lead_id)).toEqual(['e']);
    expect(dash.stats.ROADSHOW.opted_out).toBe(1);
  });
});

describe('generateReply pipeline', () => {
  const fake = (out: Partial<LlmOutput>, calls: string[] = []): LlmClient => ({
    async classify(_s, u) {
      calls.push(u);
      return { intent: 'OTHER', confidence: 0.9, language: 'id', sentiment: 'neutral', answer_in_kb: true, reason: 'r', draft: 'Baik, Bapak Bolon 😊', extracted: { visit_date: null, arrival_time: null, session: null, guests: null, pa_preferred_time: null }, model: 'm', ...out } as LlmOutput & { model: string };
    },
  });
  const run = (lead: Lead, texts: [('IN' | 'OUT'), string][], llm: LlmClient | null) =>
    generateReply({ lead, messages: texts.map(([d, t], i) => msg(d, t, i)), templates: TPL, faqs: [], events: EVENTS, llm, now: NOW });

  it('STOP -> OPT_OUT without LLM', async () => {
    const calls: string[] = [];
    const r = await run(jl({ state: 'REPLIED' }), [['IN', 'STOP']], fake({}, calls));
    expect(r).toMatchObject({ intent: 'OPT_OUT', template_code: 'OPT_OUT', suggestion: { state: 'OPTED_OUT', opt_out: true } });
    expect(calls).toHaveLength(0);
  });
  it('Bolon "Ok, terimakasih pak buk" before confirmation -> SOFT_CONFIRM, no state change', async () => {
    const r = await run(jl({ state: 'AWAITING_REPLY', session: 'S2', guests: 1, guests_bucket: '' }), [['OUT', 'B1…'], ['IN', 'Ok, terimakasih pak buk']], null);
    expect(r).toMatchObject({ intent: 'SOFT_ACK', template_code: 'SOFT_CONFIRM-B', suggestion: {} });
    expect(r.draft_text).not.toMatch(/catat/);
  });
  it('short ack after confirmation -> no reply needed', async () => {
    const r = await run(jl({ state: 'CONFIRMED' }), [['IN', 'ok makasih']], null);
    expect(r).toMatchObject({ intent: 'SMALL_TALK', draft_source: 'NONE', draft_text: '' });
  });
  it('confirm with complete data -> KONF-B rendered from extracted data', async () => {
    const r = await run(jl({ state: 'REPLIED', session: 'NONE' }), [['IN', 'Hadir, saya datang ber-2 yang jam 3']], fake({ intent: 'CONFIRM_ATTEND', extracted: { visit_date: null, arrival_time: null, session: 'S2', guests: 2, pa_preferred_time: null } }));
    expect(r.template_code).toBe('KONF-B');
    expect(r.draft_text).toContain('🕒 15.00–17.00 WIB · Private Preview & Afternoon Tea');
    expect(r.draft_text).toContain('👥 2 orang');
    expect(r.suggestion).toEqual({ session: 'S2', guests: 2 });
  });
  it('product question -> HANDOFF_PA even if the LLM wrote a price', async () => {
    const r = await run(rl({ state: 'REPLIED' }), [['IN', 'berapa harganya?']], fake({ intent: 'ASK_PRODUCT', draft: 'Harganya mulai Rp 2 M' }));
    expect(r.template_code).toBe('HANDOFF_PA');
    expect(r.draft_text).not.toMatch(/Rp|harga/i);
  });
  it('guardrail replaces bad LLM draft and keeps the original', async () => {
    const r = await run(rl({ state: 'REPLIED' }), [['IN', 'acaranya gimana?']], fake({ intent: 'ASK_EVENT_INFO', draft: 'Ada diskon 10% lho Bu, nanti saya telepon ya' }));
    expect(r.draft_source).toBe('FIXED');
    expect(r.template_code).toBe('HANDOFF_PA');
    expect(r.original_text).toContain('diskon');
    expect(r.flags.some((f) => f.startsWith('guardrail:'))).toBe(true);
  });
  it('ASK_IF_BOT human claim is rejected; honest draft passes', async () => {
    const bad = await run(rl({ state: 'REPLIED' }), [['IN', 'ini bot ya?']], fake({ intent: 'ASK_IF_BOT', draft: 'Bukan bot kok Bu, saya manusia asli' }));
    // ASK_IF_BOT fixed text is NEW_NEEDS_REVIEW by default -> HOLD until Jackson approves it.
    expect(bad.template_code).toBe('HOLD');
    expect(bad.original_text).toContain('manusia');
    expect(bad.flags).toContain('needs_attention');
    const good = await run(rl({ state: 'REPLIED' }), [['IN', 'ini bot ya?']], fake({ intent: 'ASK_IF_BOT', draft: 'Pesan ini saya siapkan dengan bantuan sistem dan saya pantau sendiri, Bu Anita 😊' }));
    expect(good.draft_source).toBe('LLM');
  });
  it('LLM 429 -> HOLD with quota note', async () => {
    const llm: LlmClient = { async classify() { throw new LlmError(429, 'quota'); } };
    const r = await run(rl({ state: 'REPLIED' }), [['IN', 'acaranya jam berapa?']], llm);
    expect(r).toMatchObject({ template_code: 'HOLD', flags: ['llm_quota'] });
  });
  it('no inbound -> error', async () => {
    await expect(run(rl(), [['OUT', 'halo']], null)).rejects.toThrow(/No new client message/);
  });
  it('instruction and only new client messages are sent as pesan_baru', async () => {
    const calls: string[] = [];
    await generateReply({ lead: jl({ state: 'REPLIED' }), messages: [msg('IN', 'saya bertiga', 0), msg('OUT', 'sesi mana Pak?', 1), msg('IN', 'lokasinya dimana?', 2)], templates: TPL, faqs: [], events: EVENTS, llm: fake({ intent: 'ASK_EVENT_INFO' }, calls), now: NOW, instruction: 'lebih singkat' });
    const u = JSON.parse(calls[0]);
    expect(u.pesan_baru_klien).toEqual(['lokasinya dimana?']);
    expect(u.riwayat).toHaveLength(2);
    expect(u.instruksi_tambahan_jackson).toBe('lebih singkat');
  });
});
