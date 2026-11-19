import { sessionInfo, type EventConfig, type EventCode } from '../../config/events';
import { TEMPLATE_VARS, type TemplateDef } from '../../config/templates';
import { sapaanFor } from './names';
import { dayName, getSalam } from './time';
import { guestsLabel, type Lead } from './types';

export type Vars = Record<string, string | undefined>;

export class RenderError extends Error {
  constructor(message: string, public readonly missing: string[] = []) { super(message); }
}

const IF_BLOCK = /\{\{#if\s+([a-z_]+)(?:\s*==\s*"([^"]*)")?\s*\}\}([\s\S]*?)\{\{\/if\}\}/g;
const PLACEHOLDER = /\{([a-z_]+)\}/g;

/** Minimal template engine: {var}, {{#if var}}..{{/if}}, {{#if var == "x"}}..{{/if}}. Throws on anything unresolved. */
export function render(body: string, vars: Vars): string {
  let out = body.replace(IF_BLOCK, (_m, name: string, eq: string | undefined, inner: string) => {
    const v = vars[name];
    const ok = eq === undefined ? v != null && v !== '' : v === eq;
    return ok ? inner : '';
  });
  const missing: string[] = [];
  out = out.replace(PLACEHOLDER, (m, name: string) => {
    const v = vars[name];
    if (v == null || v === '') { missing.push(name); return m; }
    return v;
  });
  if (missing.length) throw new RenderError(`Data belum lengkap untuk template: ${[...new Set(missing)].join(', ')}`, [...new Set(missing)]);
  if (/\{\{|\}\}|\{[a-z_]+\}/.test(out)) throw new RenderError('Masih ada placeholder tersisa');
  if (/\b(undefined|null|NaN)\b/.test(out)) throw new RenderError('Hasil mengandung undefined/null/NaN');
  if (/[[\]]/.test(out)) throw new RenderError('Hasil mengandung sisa template lama ([ atau ])');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Validate a template body before saving: only known vars, balanced if-blocks. */
export function validateTemplate(body: string): string[] {
  const errors: string[] = [];
  const known = new Set<string>(TEMPLATE_VARS);
  const stripped = body.replace(IF_BLOCK, (_m, name: string, _eq, inner: string) => {
    if (!known.has(name)) errors.push(`Variabel tidak dikenal di #if: ${name}`);
    return inner;
  });
  if (/\{\{/.test(stripped)) errors.push('Blok {{#if}} tidak seimbang');
  for (const m of stripped.matchAll(PLACEHOLDER)) if (!known.has(m[1])) errors.push(`Variabel tidak dikenal: {${m[1]}}`);
  if (/[[\]]/.test(stripped)) errors.push('Jangan memakai [ atau ] (format template lama)');
  if (!body.trim()) errors.push('Teks kosong');
  return errors;
}

export function sumberPendaftaran(lead: Pick<Lead, 'event' | 'source'>, ev: EventConfig): string {
  if (lead.event === 'ROADSHOW') return `pendaftaran ${ev.display_name} melalui agen kami`;
  if (lead.source === 'Website') return 'formulir pendaftaran Jesselton Courtyard melalui website';
  return 'formulir pendaftaran Jesselton Courtyard melalui iklan di Facebook/Instagram';
}

export function buildVars(lead: Lead, events: Record<EventCode, EventConfig>, now: Date, extra: Vars = {}): Vars {
  const ev = events[lead.event];
  const s = sapaanFor(lead.gender);
  const ses = sessionInfo(lead.session);
  const jumlah = guestsLabel(lead);
  return {
    salam: getSalam(now),
    sapaan: s.sapaan,
    sapaan_pendek: s.sapaan_pendek,
    nama: lead.call_name || undefined,
    tim_nama: ev.team_name,
    event_nama: ev.display_name,
    event_lain_nama: lead.event === 'JESSELTON' ? events.ROADSHOW.display_name : events.JESSELTON.display_name,
    hari_kunjungan: lead.event === 'JESSELTON' ? 'Sabtu' : lead.visit_date ? dayName(lead.visit_date) : undefined,
    event_sebutan: ev.short_name,
    tanggal_label: lead.visit_date_label || undefined,
    jam_datang: lead.arrival_time ? lead.arrival_time.replace(':', '.') : undefined,
    sesi_label: ses?.label,
    sesi_nama: ses?.name,
    jumlah: lead.guests != null ? String(lead.guests) : undefined,
    jumlah_label: jumlah,
    link_proyek: events.JESSELTON.project_link ?? undefined,
    guests_variant: lead.guests_bucket === '3+' ? '3plus' : lead.guests == null ? 'empty' : undefined,
    sumber_pendaftaran: sumberPendaftaran(lead, ev),
    ...extra,
  };
}

export type TemplateMap = Record<string, Pick<TemplateDef, 'code' | 'body' | 'status' | 'kind'>>;

export interface RenderOpts { allowUnapproved?: boolean }

export function renderTemplate(code: string, templates: TemplateMap, vars: Vars, opts: RenderOpts = {}): string {
  const t = templates[code];
  if (!t) throw new RenderError(`Template ${code} tidak ditemukan`);
  if (t.status !== 'APPROVED' && !opts.allowUnapproved) throw new RenderError(`Template ${code} belum disetujui (perlu ditinjau di halaman Template)`);
  return render(t.body, vars);
}
