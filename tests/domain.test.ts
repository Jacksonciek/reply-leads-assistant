import { describe, expect, it } from 'vitest';
import { EVENTS } from '../config/events';
import { DEFAULT_TEMPLATES } from '../config/templates';
import { formatBitrixTitle, parseBitrixTitle } from '../src/domain/bitrix-title';
import { resolveCase, sortKey } from '../src/domain/cases';
import { checkDraft } from '../src/domain/guardrails';
import { clickToSendLink } from '../src/domain/links';
import { deriveCallName } from '../src/domain/names';
import { normalizePhone, maskPhone } from '../src/domain/phone';
import { hasMedia, isOptOut, isShortAck } from '../src/domain/precheck';
import { jesseltonInvite } from '../src/domain/next-message';
import { routeIntent, type Classification } from '../src/domain/routing';
import { buildVars, render, renderTemplate, validateTemplate, type TemplateMap } from '../src/domain/templates';
import { fromWib, getSalam, isProactiveHours, relativeDayWord } from '../src/domain/time';
import { emptyLead, type Lead } from '../src/domain/types';
import { NOW } from './helpers';

const TPL: TemplateMap = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.code, t]));

describe('normalizePhone', () => {
  it.each([
    ['wa.me/6282343930682\n', '6282343930682'],
    ['wa.me/628126000982\n', '628126000982'],
    ['https://wa.me/6285270978351', '6285270978351'],
    ['0812-3456-7890', '6281234567890'],
    ['812 3456 7890', '6281234567890'],
    ['+62 (812) 3456-7890', '6281234567890'],
    ['  62812345678 ', '62812345678'],
  ])('%j -> %s', (raw, out) => {
    const r = normalizePhone(raw);
    expect(r.phone).toBe(out);
    expect(r.invalid).toBe(false);
  });
  it('flags invalid lengths', () => {
    expect(normalizePhone('0812').invalid).toBe(true);
    expect(normalizePhone('6281234567890123456').invalid).toBe(true);
    expect(normalizePhone('').invalid).toBe(true);
  });
  it('masks', () => expect(maskPhone('6281282090570')).toBe('62812****0570'));
});

describe('deriveCallName', () => {
  it.each([
    ['Anita Zoelisa, S.E. (Calvin Kok)', 'Anita', 'Calvin Kok', false],
    ['Roy Indrawan, S.H.', 'Roy', '', false],
    ['Sri Kurniyati ', 'Sri', '', false],
    ['Moan', 'Moan', '', true],
    ['Ramlan (Daniel Tan)', 'Ramlan', 'Daniel Tan', false],
    ['dr. Defi Widjaja, M. Biomed', 'dr. Defi', '', false],
    ['Muhammad Rusdi (Daniel Tan)', 'Rusdi', 'Daniel Tan', true],
    ['Su Kardi', 'Su', '', true],
    ['Prof. Dr. Budi Santoso, MBA', 'Prof. Dr. Budi', '', false],
    ['Ir. Hendra Gunawan', 'Hendra', '', false],
    ['Hikmatul Rizal Bin Bukhari', 'Hikmatul', '', false],
    ['Siregar', 'Siregar', '', true],
    ['ANDI WIJAYA', 'Andi', '', false],
    ['Bend Mince QiuQiu', 'Bend', '', false],
    ['M. Yusuf', 'Yusuf', '', true],
  ])('%s', (full, call, agent, review) => {
    const r = deriveCallName(full);
    expect(r.callName).toBe(call);
    expect(r.agentName).toBe(agent);
    expect(r.needsReview).toBe(review);
  });
});

describe('salam & hours (WIB, independent of server TZ)', () => {
  const at = (hh: number, mm: number) => fromWib('2026-11-20', hh, mm);
  it.each([
    [2, 59, 'malam'], [3, 0, 'pagi'], [10, 59, 'pagi'], [11, 0, 'siang'], [14, 59, 'siang'],
    [15, 0, 'sore'], [17, 59, 'sore'], [18, 0, 'malam'], [23, 30, 'malam'],
  ])('%d:%d -> %s', (h, m, s) => expect(getSalam(at(h, m))).toBe(s));
  it('UTC instant maps to WIB', () => expect(getSalam(new Date('2026-11-20T00:00:00Z'))).toBe('pagi'));
  it('proactive hours', () => {
    expect(isProactiveHours(at(8, 59))).toBe(false);
    expect(isProactiveHours(at(9, 0))).toBe(true);
    expect(isProactiveHours(at(20, 0))).toBe(true);
    expect(isProactiveHours(at(20, 1))).toBe(false);
  });
  it('relative day word', () => {
    expect(relativeDayWord(at(8, 0).toISOString(), at(20, 0))).toBe('hari ini');
    expect(relativeDayWord(fromWib('2026-11-19', 23).toISOString(), at(1, 0))).toBe('kemarin');
    expect(relativeDayWord(fromWib('2026-11-17', 9).toISOString(), at(9, 0))).toBe('sebelumnya');
    expect(relativeDayWord(null, at(9, 0))).toBe('sebelumnya');
  });
});

describe('parseBitrixTitle / formatBitrixTitle', () => {
  it('roadshow example', () => {
    const r = parseBitrixTitle('Anita Zoelisa, S.E. (Calvin Kok) | KL Property Roadshow Medan - Nov26 | 23/11');
    expect(r).toMatchObject({ event: 'ROADSHOW', source: 'Agent', visit_date: '2026-11-23', visit_date_label: 'Senin, 23 November 2026', call_name: 'Anita', agent_name: 'Calvin Kok' });
    expect(r.warnings).toEqual([]);
  });
  it('jesselton example', () => {
    const r = parseBitrixTitle('Bolon Parson | Jesselton Courtyard - Meta | 28/11');
    expect(r).toMatchObject({ event: 'JESSELTON', source: 'Meta', full_name: 'Bolon Parson' });
    expect(r.warnings).toEqual([]);
  });
  it.each(['TBC', '-', '', '?', 'belum pasti'])('undecided date %j', (d) => {
    const r = parseBitrixTitle(`Deny Abdi | KL Property Roadshow Medan - Nov26 | ${d}`);
    expect(r.visit_date).toBeNull();
    expect(r.warnings).toEqual([]);
  });
  it('messy spacing, case, dashes, Web/Website', () => {
    expect(parseBitrixTitle('  andi  |  jesselton courtyard — web |28/11').source).toBe('Website');
    expect(parseBitrixTitle('Andi|JESSELTON COURTYARD – Website|28/11').source).toBe('Website');
    expect(parseBitrixTitle('Andi | jesselton courtyard - META | 28/11').source).toBe('Meta');
  });
  it('out of range dates warn but are kept', () => {
    const r = parseBitrixTitle('X Y | KL Property Roadshow Medan - Nov26 | 30/11');
    expect(r.visit_date).toBe('2026-11-30');
    expect(r.warnings.map((w) => w.field)).toContain('visit_date');
    expect(parseBitrixTitle('X Y | Jesselton Courtyard - Meta | 27/11').warnings.map((w) => w.field)).toContain('visit_date');
  });
  it('unknown event warns', () => expect(parseBitrixTitle('X | Something else | 23/11').warnings[0].field).toBe('event'));
  it('round trip', () => {
    for (const lead of [
      emptyLead({ event: 'ROADSHOW', full_name: 'Ramlan (Daniel Tan)', source: 'Agent', visit_date: '2026-11-25' }),
      emptyLead({ event: 'ROADSHOW', full_name: 'Deny Abdi', source: 'Agent', visit_date: null }),
      emptyLead({ event: 'JESSELTON', full_name: 'Andi', source: 'Website' }),
      emptyLead({ event: 'JESSELTON', full_name: 'Bolon Parson', source: 'Meta' }),
    ]) {
      const title = formatBitrixTitle(lead);
      const p = parseBitrixTitle(title);
      expect(p.event).toBe(lead.event);
      expect(p.full_name).toBe(lead.full_name);
      expect(p.source).toBe(lead.source);
      if (lead.event === 'ROADSHOW') expect(p.visit_date).toBe(lead.visit_date);
      expect(p.warnings).toEqual([]);
    }
    expect(formatBitrixTitle(emptyLead({ event: 'ROADSHOW', full_name: 'A B', visit_date: null }))).toContain('| TBC');
  });
});

const jl = (p: Partial<Lead>) => emptyLead({ event: 'JESSELTON', call_name: 'Budi', gender: 'Bapak', phone_e164: '6281200000000', ...p });
const rl = (p: Partial<Lead>) => emptyLead({ event: 'ROADSHOW', call_name: 'Budi', gender: 'Bapak', phone_e164: '6281200000000', ...p });

describe('resolveCase extras', () => {
  it('B3 synthetic', () => expect(resolveCase(jl({ session: 'NONE', guests: 2, guests_bucket: '' }), NOW).code).toBe('B3'));
  it('B3 with 3+', () => expect(resolveCase(jl({ session: 'UNDECIDED', guests_bucket: '3+' }), NOW).code).toBe('B3'));
  it('roadshow reminder rounds: 23 Nov and H-1, A4 with date, A3 without', () => {
    const d23 = fromWib('2026-11-23', 9);
    const v27 = rl({ state: 'REMINDER', visit_date: '2026-11-27', visit_date_label: 'Jumat, 27 November 2026' });
    expect(resolveCase(v27, d23)).toMatchObject({ code: 'A4', due: true });
    const sent23 = { ...v27, last_reminder_at: fromWib('2026-11-23', 10).toISOString() };
    expect(resolveCase(sent23, fromWib('2026-11-23', 11))).toMatchObject({ code: 'A4', due: false });
    expect(resolveCase(sent23, fromWib('2026-11-25', 9))).toMatchObject({ code: 'A4', due: false });
    expect(resolveCase(sent23, fromWib('2026-11-26', 9))).toMatchObject({ code: 'A4', due: true }); // H-1
    expect(resolveCase(rl({ state: 'REMINDER' }), d23)).toMatchObject({ code: 'A3', due: true });
    expect(resolveCase(rl({ state: 'REMINDER', visit_date: '2026-11-23' }), d23)).toMatchObject({ code: 'A4', due: true });
  });
  it('roadshow: passed visit date asks again (A3, not due); over after the event', () => {
    expect(resolveCase(rl({ state: 'REMINDER', visit_date: '2026-11-23' }), fromWib('2026-11-24', 9))).toMatchObject({ code: 'A3', due: false });
    expect(resolveCase(rl({ state: 'REMINDER' }), fromWib('2026-11-30', 9)).code).toBe('WAIT');
  });
  it('jesselton reminder: B6 when session known, B-R otherwise, B-H1 from 27 Nov', () => {
    const d23 = fromWib('2026-11-23', 9);
    expect(resolveCase(jl({ state: 'REMINDER', session: 'S2', guests: 2, guests_bucket: '' }), d23)).toMatchObject({ code: 'B6', due: true });
    expect(resolveCase(jl({ state: 'REMINDER', session: 'NONE' }), d23)).toMatchObject({ code: 'B-R', due: true });
    const sent = jl({ state: 'REMINDER', session: 'S1', last_reminder_at: fromWib('2026-11-23', 10).toISOString() });
    expect(resolveCase(sent, fromWib('2026-11-25', 9))).toMatchObject({ code: 'B6', due: false });
    expect(resolveCase(sent, fromWib('2026-11-27', 9))).toMatchObject({ code: 'B-H1', due: true });
    expect(resolveCase(jl({ state: 'REMINDER' }), new Date('2026-11-29T03:00:00Z')).code).toBe('WAIT');
  });
  it('NEW gets the first message, DONE nothing, flags exclude', () => {
    expect(resolveCase(rl({ visit_date: '2026-11-25' }), NOW)).toMatchObject({ code: 'A1', due: true });
    expect(resolveCase(rl({ state: 'DONE' }), NOW).code).toBe('DONE');
    expect(resolveCase(rl({ state: 'REMINDER', no_whatsapp: true }), NOW).code).toBe('X');
  });
  it('sort: Roadshow first, due before sent, visit today then tomorrow then later then undecided', () => {
    const now = fromWib('2026-11-23', 9);
    const key = (l: Lead) => sortKey(l, resolveCase(l, now), now);
    const ls = [
      jl({ full_name: 'J', state: 'REMINDER', session: 'S1' }),
      rl({ full_name: 'TBC', state: 'REMINDER' }),
      rl({ full_name: 'Later', state: 'REMINDER', visit_date: '2026-11-27' }),
      rl({ full_name: 'Tomorrow', state: 'REMINDER', visit_date: '2026-11-24' }),
      rl({ full_name: 'Today', state: 'REMINDER', visit_date: '2026-11-23' }),
      rl({ full_name: 'Sent', state: 'REMINDER', visit_date: '2026-11-23', last_reminder_at: now.toISOString() }),
    ];
    expect([...ls].sort((a, b) => key(a).localeCompare(key(b))).map((l) => l.full_name)).toEqual(['Today', 'Tomorrow', 'Later', 'TBC', 'Sent', 'J']);
  });
  it('opt-out is X', () => expect(resolveCase(rl({ opt_out: true }), NOW).code).toBe('X'));
});

describe('render', () => {
  it('throws on missing placeholder', () => expect(() => render('Hi {nama}', {})).toThrow(/nama/));
  it('throws on leftovers', () => {
    expect(() => render('Hi [Nama]', {})).toThrow();
    expect(() => render('x {a}', { a: 'undefined' } as never)).toThrow();
  });
  it('if blocks', () => {
    expect(render('a{{#if x}} b{{/if}}', {})).toBe('a');
    expect(render('a{{#if x == "1"}} b{{/if}}', { x: '1' })).toBe('a b');
  });
  it('gender empty uses Bapak/Ibu', () => {
    const lead = rl({ gender: '', visit_date: null });
    const text = renderTemplate('A2', TPL, buildVars(lead, EVENTS, NOW));
    expect(text).toContain('Bapak/Ibu Budi');
    expect(text).toContain('Pak/Bu');
  });
  it('KONF-A with and without jam', () => {
    const lead = rl({ visit_date: '2026-11-25', visit_date_label: 'Rabu, 25 November 2026' });
    expect(renderTemplate('KONF-A', TPL, buildVars(lead, EVENTS, NOW))).not.toContain('sekitar pukul');
    expect(renderTemplate('KONF-A', TPL, buildVars({ ...lead, arrival_time: '14:00' }, EVENTS, NOW))).toContain('sekitar pukul 14.00 WIB');
  });
  it('KONF-B refuses without guests', () => {
    expect(() => renderTemplate('KONF-B', TPL, buildVars(jl({ session: 'S1', guests: null }), EVENTS, NOW))).toThrow();
  });
  it('NEW_NEEDS_REVIEW blocks', () => {
    const lead = rl({ visit_date: '2026-11-25', visit_date_label: 'Rabu, 25 November 2026' });
    expect(() => renderTemplate('ASK_IF_BOT', TPL, buildVars(lead, EVENTS, NOW))).toThrow(/belum disetujui/);
  });
  it('validateTemplate', () => {
    expect(validateTemplate(TPL['B2'].body)).toEqual([]);
    expect(validateTemplate('Halo {foo}')).toHaveLength(1);
    for (const t of DEFAULT_TEMPLATES) expect(validateTemplate(t.body)).toEqual([]);
  });
});

describe('guardrails', () => {
  const ok = (t: string, intent?: string) => checkDraft(t, { projectLink: EVENTS.JESSELTON.project_link, intent });
  it.each([
    'Harganya mulai Rp 2 miliar ya Pak', 'Mulai RM 500 ribu', 'Ada diskon 10% untuk Bapak', 'Cicilan ringan tersedia',
    'Unit tersedia tinggal sedikit', 'Nanti saya telepon ya Pak', 'Silakan cek www.contoh.com', 'Hubungi 0812 3456 7890',
    'Email ke a@b.com ya', 'Tipe unit 3 kamar', 'Bisa dapat visa MM2H', 'Sekitar 2 M saja', 'ROI 8 persen dijamin',
  ])('blocks %s', (t) => expect(ok(t).ok).toBe(false));
  it.each([
    'Acaranya di Emerald 1, Lantai 25, Cambridge Hotel Medan 😊',
    'Sesi 11.00–13.00 WIB pada Sabtu, 28 November 2026.',
    'Informasi proyek: https://jesselton-medan.pages.dev/',
    'Baik Pak, saya pastikan dulu ya.',
  ])('allows %s', (t) => expect(ok(t)).toEqual({ ok: true, flags: [] }));
  it('human claim on ASK_IF_BOT', () => {
    expect(ok('Bukan bot kok Pak, saya manusia', 'ASK_IF_BOT').flags).toContain('human_claim');
  });
  it('length and emoji', () => {
    expect(ok('a'.repeat(601)).flags).toContain('too_long');
    expect(ok('Halo 😊 🙏').flags).toContain('emoji');
  });
});

describe('precheck', () => {
  it.each(['STOP', 'stop ya', 'Tolong jangan hubungi saya lagi', 'gak usah chat lagi', 'hapus nomor saya', 'Berhenti', 'jangan wa saya'])('opt-out %s', (t) => expect(isOptOut(t)).toBe(true));
  it.each(['Saya datang hari Senin', 'tidak bisa hadir'])('not opt-out %s', (t) => expect(isOptOut(t)).toBe(false));
  it.each(['ok', 'ok makasih', 'Terima kasih Pak', '👍', '🙏🙏', 'siap', 'Ok, terimakasih pak buk', 'thx'])('short ack %s', (t) => expect(isShortAck(t)).toBe(true));
  it.each(['ok saya datang jam 3', 'Ya', 'iya', 'berapa harganya?', 'Hadir'])('not short ack %s', (t) => expect(isShortAck(t)).toBe(false));
  it.each(['<Media omitted>', '<Media tidak disertakan>', 'audio omitted'])('media %s', (t) => expect(hasMedia(t)).toBe(true));
});

describe('routing', () => {
  const base: Classification = { intent: 'OTHER', confidence: 0.9, sentiment: 'neutral', answer_in_kb: true, extracted: { visit_date: null, arrival_time: null, session: null, guests: null, pa_preferred_time: null } };
  const route = (p: Partial<Classification>, lead: Lead = jl({ state: 'REMINDER' })) => routeIntent({ ...base, ...p }, lead);

  it('confirm with complete data -> KONF-B + data suggestion', () => {
    const r = route({ intent: 'CONFIRM_ATTEND', extracted: { ...base.extracted, session: 'S2', guests: 2 } });
    expect(r.draft).toEqual({ kind: 'TEMPLATE', code: 'KONF-B' });
    expect(r.suggestion).toEqual({ session: 'S2', guests: 2 });
  });
  it('roadshow confirm with date -> KONF-A', () => {
    const r = route({ intent: 'CONFIRM_ATTEND', extracted: { ...base.extracted, visit_date: '2026-11-25' } }, rl({ state: 'REMINDER' }));
    expect(r.draft).toEqual({ kind: 'TEMPLATE', code: 'KONF-A' });
  });
  it('confirm incomplete -> LLM ask, data still suggested', () => {
    const r = route({ intent: 'CONFIRM_ATTEND', extracted: { ...base.extracted, guests: 2 } });
    expect(r.draft.kind).toBe('LLM');
    expect(r.suggestion).toEqual({ guests: 2 });
  });
  it('low confidence complete -> LLM, not KONF', () => expect(route({ intent: 'CONFIRM_ATTEND', confidence: 0.6, extracted: { ...base.extracted, session: 'S1', guests: 1 } }).draft.kind).toBe('LLM'));
  it.each([
    ['ASK_PRODUCT', 'HANDOFF_PA', { needs_pa: true }], ['REQUEST_CALL', 'CALL_REQUEST', { needs_pa: true }],
    ['OPT_OUT', 'OPT_OUT', { opt_out: true }], ['SOURCE_QUESTION', 'SOURCE', { needs_attention: true }],
    ['DECLINE', 'DECLINE', { opt_out: true }],
  ] as const)('%s -> %s', (intent, code, sug) => {
    const r = route({ intent, confidence: 0.3 });
    expect(r.draft).toEqual({ kind: 'FIXED', code });
    expect(r.suggestion).toEqual(sug);
  });
  it('PA time saved', () => expect(route({ intent: 'PA_TIME_GIVEN', extracted: { ...base.extracted, pa_preferred_time: 'besok 14.00' } }).suggestion).toEqual({ needs_pa: true, pa_preferred_time: 'besok 14.00' }));
  it('attention intents', () => {
    for (const intent of ['ASK_IF_BOT', 'SUSPICIOUS', 'COMPLAINT'] as const) expect(route({ intent })).toMatchObject({ draft: { kind: 'LLM' }, needsAttention: true });
  });
  it('negative sentiment -> attention', () => expect(route({ intent: 'ASK_EVENT_INFO', sentiment: 'negative' }).needsAttention).toBe(true));
  it('event info in/out of KB', () => {
    expect(route({ intent: 'ASK_EVENT_INFO' }).draft).toEqual({ kind: 'LLM' });
    const r = route({ intent: 'ASK_EVENT_INFO', answer_in_kb: false });
    expect(r.draft).toEqual({ kind: 'FIXED', code: 'HOLD' });
    expect(r.notes.join()).toMatch(/FAQ/);
  });
  it('request info per event', () => {
    expect(route({ intent: 'REQUEST_INFO' }, rl({ state: 'REMINDER' })).draft).toEqual({ kind: 'LLM' });
    expect(route({ intent: 'FORGOT_REGISTRATION' }, rl({ state: 'REMINDER' })).draft).toEqual({ kind: 'LLM' });
    expect(route({ intent: 'REQUEST_INFO' }).draft).toEqual({ kind: 'LLM' });
  });
  it('small talk -> nothing', () => expect(route({ intent: 'SMALL_TALK' }).draft.kind).toBe('NONE'));
});

describe('click-to-send links', () => {
  const text = 'Selamat pagi, Ibu Anita 😊\n\nA & B # C ? D 🙏';
  it('wa.me keeps emoji/newlines', () => {
    const link = clickToSendLink('6282343930682', text);
    expect(link.startsWith('https://wa.me/6282343930682?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe(text);
    expect(link.split('?text=')[1]).not.toMatch(/[\n #&?]/);
  });
  it('android business intent', () => {
    const link = clickToSendLink('6282343930682', text, 'android_business');
    expect(link).toMatch(/^intent:\/\/send\?phone=6282343930682&text=.+#Intent;scheme=whatsapp;package=com\.whatsapp\.w4b;end$/);
    const enc = link.slice(link.indexOf('&text=') + 6, link.indexOf('#Intent'));
    expect(decodeURIComponent(enc)).toBe(text);
    expect(enc).not.toMatch(/[#&?\n ]/);
  });
});

describe('Jesselton invitation (JC-INV / JC-FIX)', () => {
  const lead = (p: Partial<Lead>) => emptyLead({ event: 'JESSELTON', gender: 'Bapak', call_name: 'Andi', visit_date: '2026-11-28', ...p });
  const inv = (p: Partial<Lead>) => jesseltonInvite(lead(p), TPL, NOW);

  it('picks the template set from the WhatsApp status', () => {
    expect(inv({ wa_status: 'CONFIRMED', session: 'S2', guests: 2, guests_bucket: '' })?.codes).toEqual(['JC-FIX-1', 'JC-FIX-2']);
    expect(inv({ wa_status: 'NO_REPLY' })?.codes).toEqual(['JC-INV-1', 'JC-INV-2']);
    expect(inv({ wa_status: 'UNSURE' })?.codes).toEqual(['JC-INV-1', 'JC-INV-2']);
    for (const s of ['BAD_LEAD', 'NO_WA', 'CANNOT_ATTEND', ''] as const) expect(inv({ wa_status: s })).toBeNull();
    expect(jesseltonInvite(emptyLead({ event: 'ROADSHOW', wa_status: 'NO_REPLY' }), TPL, NOW)).toBeNull();
  });

  it('message 2 asks only for what is missing', () => {
    const p2 = (p: Partial<Lead>) => inv({ wa_status: 'NO_REPLY', ...p })!.parts![1];
    expect(p2({ session: 'NONE', guests: null, guests_bucket: 'unknown' })).toBe('Kalau berkenan hadir, lebih nyaman ikut sesi *jam 11.00 siang* atau *jam 15.00 sore*? Dan kira-kira datang bersama berapa orang? Terima kasih Pak! 🙏🏻');
    expect(p2({ session: 'S1', guests: null, guests_bucket: 'unknown' })).toBe('Kami sudah catat Bapak untuk *sesi jam 11.00*. Kira-kira datang bersama berapa orang? Terima kasih Pak! 🙏🏻');
    expect(p2({ session: 'UNDECIDED', guests: 2, guests_bucket: '' })).toBe('Kami sudah catat Bapak untuk *2 orang*. Kalau berkenan hadir, lebih nyaman ikut sesi *jam 11.00 siang* atau *jam 15.00 sore*? Terima kasih Pak! 🙏🏻');
    expect(p2({ session: 'S2', guests: null, guests_bucket: '3+' })).toBe('Kami sudah catat Bapak untuk *sesi jam 15.00* bersama *3 orang atau lebih*. Boleh tahu jumlah pastinya? Mohon dibalas *"Hadir"* bila jadwalnya masih sesuai ya. Terima kasih Pak! 🙏🏻');
  });

  it('message 1 has the place; the fixed reminder has session and guests', () => {
    expect(inv({ wa_status: 'NO_REPLY' })!.parts![0]).toContain('Hi Bapak Andi 😊\n\nSabtu ini, 28 November 2026, kami mengadakan *Private Preview Jesselton Courtyard* di *Cambridge Hotel Medan, Emerald 1 (Lantai 25)*. Sehingga, kami ingin mengingatkan kembali dan mengundang Bapak secara pribadi.');
    const fix = inv({ wa_status: 'CONFIRMED', session: 'S2', guests: 2, guests_bucket: '' })!.parts!;
    expect(fix[0]).toContain('Kami sudah catat Bapak untuk *sesi jam 15.00 WIB* bersama *2 orang*.');
    expect(fix[1]).toBe('Semoga bisa bertemu Sabtu nanti ya, terima kasih Pak! 🙏🏻');
  });
});
