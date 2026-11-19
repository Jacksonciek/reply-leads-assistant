// npm run eval — run the reply pipeline against tests/fixtures/eval-cases.json with the real Gemini API.
// Writes eval-report.md (gitignored). Uses synthetic names only; no real lead data is sent.
import { readFileSync, writeFileSync } from 'node:fs';
import { EVENTS, type EventCode } from '../config/events';
import { DEFAULT_TEMPLATES } from '../config/templates';
import { checkDraft } from '../src/domain/guardrails';
import type { TemplateMap } from '../src/domain/templates';
import { dateLabel } from '../src/domain/time';
import { emptyLead, type Lead, type Message } from '../src/domain/types';
import { generateReply } from '../src/worker/services/generate';
import { GeminiClient } from '../src/worker/services/llm';
import { loadDevVars } from './env';

interface Case {
  id: number; event: EventCode; lead?: Partial<Lead>; history?: { dir: 'IN' | 'OUT'; text: string }[]; message: string;
  intent: string; intent_alt?: string[];
  expect?: { session?: string; guests?: number; visit_date?: string; template?: string; not_template?: string; attention?: boolean; no_llm?: boolean; no_ask_guests?: boolean; no_ask_date?: boolean };
}

const MUST_100 = ['ASK_PRODUCT', 'REQUEST_CALL', 'DECLINE', 'OPT_OUT'];
const env = loadDevVars();
if (!env.GEMINI_API_KEY) { console.error('Isi GEMINI_API_KEY di .dev.vars'); process.exit(1); }
const llm = new GeminiClient({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-flash-lite-latest', fallbackModel: env.GEMINI_FALLBACK_MODEL });
const templates: TemplateMap = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.code, { ...t, status: 'APPROVED' as const }]));
const cases: Case[] = JSON.parse(readFileSync('tests/fixtures/eval-cases.json', 'utf8'));
const now = new Date('2026-11-21T03:00:00Z'); // Sabtu 21 Nov 10.00 WIB

const rows: string[] = [];
const fails: string[] = [];
const confusion = new Map<string, number>();
let correct = 0;
const per = new Map<string, { ok: number; n: number }>();

for (const c of cases) {
  const lead = emptyLead({
    lead_id: `L${c.id}`, event: c.event, full_name: 'Budi Santoso', call_name: 'Budi', gender: 'Bapak', state: 'REPLIED',
    phone_e164: '6281200000000', source: c.event === 'ROADSHOW' ? 'Agent' : 'Meta', ...c.lead,
  });
  if (lead.event === 'ROADSHOW' && lead.visit_date) lead.visit_date_label = dateLabel(lead.visit_date);
  if (lead.event === 'JESSELTON') { lead.visit_date = '2026-11-28'; lead.visit_date_label = dateLabel('2026-11-28'); if (lead.guests != null) lead.guests_bucket = ''; }
  const msgs: Message[] = [...(c.history ?? []), { dir: 'IN' as const, text: c.message }].map((m, i) => ({
    msg_id: `M${i}`, lead_id: lead.lead_id, direction: m.dir, source: 'PASTED', text: m.text, template_code: '',
    sent_at: new Date(now.getTime() - (10 - i) * 60_000).toISOString(), created_at: '', deleted: false,
  }));
  let r;
  try {
    r = await generateReply({ lead, messages: msgs, templates, faqs: [], events: EVENTS, llm, now });
  } catch (e) {
    fails.push(`#${c.id} error: ${(e as Error).message}`);
    continue;
  }
  const okIntent = r.intent === c.intent || (c.intent_alt ?? []).includes(r.intent);
  if (okIntent) correct++;
  const p = per.get(c.intent) ?? { ok: 0, n: 0 };
  p.n++; if (okIntent) p.ok++; per.set(c.intent, p);
  if (!okIntent) confusion.set(`${c.intent} -> ${r.intent}`, (confusion.get(`${c.intent} -> ${r.intent}`) ?? 0) + 1);

  const problems: string[] = [];
  const e = c.expect ?? {};
  if (!okIntent) problems.push(`intent ${r.intent}`);
  if (e.template && r.template_code !== e.template) problems.push(`template ${r.template_code || r.draft_source} (harap ${e.template})`);
  if (e.not_template && r.template_code === e.not_template) problems.push(`tidak boleh ${e.not_template}`);
  const ex = r.extracted as Record<string, unknown>;
  if (e.session && ex.session !== e.session) problems.push(`session ${ex.session}`);
  if (e.guests && ex.guests !== e.guests) problems.push(`guests ${ex.guests}`);
  if (e.visit_date && ex.visit_date !== e.visit_date) problems.push(`visit_date ${ex.visit_date}`);
  if (e.attention && !r.flags.includes('needs_attention')) problems.push('tidak ditandai perlu perhatian');
  if (e.no_llm && r.llm_payload) problems.push('memanggil LLM');
  if (e.no_ask_guests && /berapa orang|jumlah tamu|bersama berapa/i.test(r.draft_text)) problems.push('menanyakan ulang jumlah tamu');
  if (e.no_ask_date && /hari apa|tanggal berapa|kapan .*berkunjung/i.test(r.draft_text)) problems.push('menanyakan ulang tanggal');
  // Zero tolerance: no final LLM draft may mention prices/product numbers/phone offers.
  if (r.draft_source === 'LLM') {
    const g = checkDraft(r.draft_text, { intent: r.intent, projectLink: EVENTS.JESSELTON.project_link, attendanceStated: true });
    const bad = g.flags.filter((f) => ['currency', 'amount', 'phone_offer', 'phone_number'].includes(f) || f.startsWith('forbidden:'));
    if (bad.length) problems.push(`LOLOS GUARDRAIL: ${bad.join(',')}`);
  }
  if (problems.length) fails.push(`#${c.id} "${c.message}": ${problems.join('; ')}`);
  rows.push(`| ${c.id} | ${c.intent} | ${r.intent} ${okIntent ? '✅' : '❌'} | ${r.draft_source}${r.template_code ? ' ' + r.template_code : ''} | ${r.flags.filter((f) => f.startsWith('guardrail')).join(' ')} | ${r.draft_text.replace(/\n/g, ' ').slice(0, 160)} |`);
  process.stdout.write(okIntent ? '.' : 'x');
}

const acc = correct / cases.length;
const must = MUST_100.map((i) => ({ i, ...(per.get(i) ?? { ok: 0, n: 0 }) }));
const report = `# Laporan evaluasi LLM (${new Date().toISOString()})

Model: ${env.GEMINI_MODEL || 'gemini-flash-lite-latest'} (fallback ${env.GEMINI_FALLBACK_MODEL || '-'})

**Akurasi intent: ${(acc * 100).toFixed(1)}%** (${correct}/${cases.length}, target ≥ 85%)

Intent wajib 100%: ${must.map((m) => `${m.i} ${m.ok}/${m.n}`).join(', ')}

## Akurasi per intent
${[...per].map(([k, v]) => `- ${k}: ${v.ok}/${v.n}`).join('\n')}

## Salah klasifikasi (harapan -> hasil)
${[...confusion].map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (tidak ada)'}

## Masalah
${fails.map((f) => `- ${f}`).join('\n') || '- (tidak ada)'}

## Contoh draft
| # | Harapan | Hasil | Sumber | Guardrail | Draft |
|---|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync('eval-report.md', report);
console.log(`\nAkurasi ${(acc * 100).toFixed(1)}%. Masalah: ${fails.length}. Laporan: eval-report.md`);
const pass = acc >= 0.85 && must.every((m) => m.ok === m.n) && !fails.some((f) => f.includes('LOLOS GUARDRAIL'));
process.exit(pass ? 0 : 1);
