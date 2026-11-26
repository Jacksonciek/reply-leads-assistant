// One-off helper: runs the app's own API in-process against Supabase (.dev.vars). Never touches WhatsApp.
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';
import { createApp } from '../src/worker/app';
import { makeServices } from '../src/worker/services';
import { loadDevVars } from '../scripts/env';
import { parseSheetRows } from '../src/domain/parse-excel-row';

const env = { ...loadDevVars('D:/GitHub/reply-leads-assistant/.dev.vars'), REQUIRE_PASSWORD: 'false' } as any;
const app = createApp(makeServices);
const req = async (method: string, path: string, body?: unknown) => {
  const r = await app.fetch(new Request(`http://x${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env);
  const j = await r.json() as any;
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'backup') {
  const svc = makeServices(env);
  const out: Record<string, string[][]> = {};
  for (const t of ['Roadshow', 'Jesselton', 'Messages', 'Drafts', 'Config', 'FAQ', 'Templates']) out[t] = await svc.store.read(t);
  writeFileSync(arg, JSON.stringify(out));
  console.log('backup', Object.entries(out).map(([k, v]) => `${k}:${v.length}`).join(' '));
} else if (cmd === 'excel') {
  const wb = XLSX.read(readFileSync(arg));
  const read = (n: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n], { defval: '', raw: false });
  const leads = [...parseSheetRows('Roadshow', read('Roadshow')), ...parseSheetRows('Jesselton', read('Jesselton'))].map((p) => p.lead);
  console.log(await req('POST', '/api/import/commit', { mode: 'update', leads }));
  const all = (await req('GET', '/api/leads')).leads as any[];
  const keys = new Set(leads.map((l) => `${l.event}:${l.phone_e164}`));
  console.log('in DB but not in Excel:', all.filter((l) => !keys.has(`${l.event}:${l.phone_e164}`)).map((l) => `${l.event} ${l.full_name} ${l.phone_e164} ${l.lead_id}`));
} else if (cmd === 'list') {
  const all = (await req('GET', '/api/leads')).leads as any[];
  all.sort((a, b) => a.event.localeCompare(b.event) || a.no - b.no);
  writeFileSync(arg, JSON.stringify(all.map((l) => ({ id: l.lead_id, ev: l.event, no: l.no, name: l.full_name, phone: l.phone_e164, notes: l.notes, date: l.visit_date_label, session: l.session, guests: l.guests ?? l.guests_bucket, gender: l.gender, call: l.call_name })), null, 1));
  console.log(all.length, 'leads');
} else if (cmd === 'wa') {
  // { "<phone>": [{direction, text, sent_at}] } -> every lead with that phone
  const chats = JSON.parse(readFileSync(arg, 'utf8')) as Record<string, any[]>;
  const all = (await req('GET', '/api/leads')).leads as any[];
  for (const [phone, msgs] of Object.entries(chats)) {
    if (!msgs.length) continue;
    for (const l of all.filter((x) => x.phone_e164 === phone)) console.log(l.event, l.full_name, (await req('PUT', `/api/leads/${l.lead_id}/whatsapp`, { messages: msgs })).added);
  }
} else if (cmd === 'wafull') {
  // Full replace: delete every stored message of the lead, then store exactly what WhatsApp Web shows.
  const svc = makeServices(env);
  const chats = JSON.parse(readFileSync(arg, 'utf8')) as Record<string, any[]>;
  const all = (await req('GET', '/api/leads')).leads as any[];
  for (const [phone, msgs] of Object.entries(chats)) {
    for (const l of all.filter((x) => x.phone_e164.replace(/\D/g, '') === phone)) {
      const old = await svc.repo.messagesFor(l.lead_id);
      await svc.repo.messages.updateMany('msg_id', new Map(old.map((m) => [m.msg_id, { deleted: 'TRUE' }])));
      if (!msgs.length) { console.log(l.event, l.full_name, old.length, '-> 0 (kosong)'); continue; }
      console.log(l.event, l.full_name, old.length, '->', (await req('PUT', `/api/leads/${l.lead_id}/whatsapp`, { messages: msgs })).added);
    }
  }
} else if (cmd === 'patch') {
  // [{ id, ...fields }]
  for (const p of JSON.parse(readFileSync(arg, 'utf8')) as any[]) { const { id, ...b } = p; await req('PATCH', `/api/leads/${id}`, b); }
  console.log('patched');
}
if (cmd === 'verify') {
  const { leadToExcelRow, EXCEL_COLUMNS } = await import('../src/domain/sheet-row');
  const wb = XLSX.read(readFileSync(arg));
  const all = (await req('GET', '/api/leads')).leads as any[];
  let diffs = 0;
  for (const [sheet, ev] of [['Roadshow', 'ROADSHOW'], ['Jesselton', 'JESSELTON']] as const) {
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: '', raw: false }).filter((r) => String(r['Name']).trim());
    const db = all.filter((l) => l.event === ev).sort((a, b) => a.no - b.no).map((l) => leadToExcelRow(l));
    if (db.length !== raw.length) console.log(sheet, 'count', db.length, raw.length);
    raw.forEach((r, i) => { for (const c of EXCEL_COLUMNS[ev]) { const a = String(r[c] ?? '').trim(), b = String(db[i]?.[c] ?? '').trim(); if (a !== b) { diffs++; console.log(sheet, r['No'], c, a, '=>', b); } } });
  }
  console.log('verify diffs', diffs);
}
if (cmd === 'add') {
  // { "<lead_id>": [{direction, text, sent_at, source}] }
  for (const [id, messages] of Object.entries(JSON.parse(readFileSync(arg, 'utf8')) as Record<string, any[]>)) console.log(id, (await req('POST', `/api/leads/${id}/messages`, { messages })).added.length);
}
