import { EVENTS, type EventCode } from '../../config/events';
import { deriveCallName } from './names';
import { roadshowDateWarning } from './parse-excel-row';
import { dateLabel } from './time';
import type { Lead, LeadSource } from './types';

export interface BitrixParse {
  event: EventCode | null;
  full_name: string;
  call_name: string;
  call_name_needs_review: boolean;
  agent_name: string;
  source: LeadSource;
  visit_date: string | null;
  visit_date_label: string;
  warnings: { field: string; message: string }[];
}

const UNDECIDED = /^(|-|tbc|\?|belum\s*pasti)$/i;

/**
 * Parse "Nama | KL Property Roadshow Medan - Nov26 | 23/11"
 * or "Nama | Jesselton Courtyard - Meta | 28/11".
 */
export function parseBitrixTitle(title: string): BitrixParse {
  const warnings: BitrixParse['warnings'] = [];
  const parts = String(title ?? '').replace(/[–—]/g, '-').split('|').map((p) => p.replace(/\s+/g, ' ').trim());
  const name = parts[0] ?? '';
  const cn = deriveCallName(name);
  const res: BitrixParse = {
    event: null, full_name: name, call_name: cn.callName, call_name_needs_review: cn.needsReview,
    agent_name: cn.agentName, source: '', visit_date: null, visit_date_label: '', warnings,
  };
  if (!name) warnings.push({ field: 'full_name', message: 'Name not found' });

  const ev = (parts[1] ?? '').toLowerCase();
  if (/roadshow|pameran/.test(ev)) { res.event = 'ROADSHOW'; res.source = 'Agent'; }
  else if (/jesselton/.test(ev)) {
    res.event = 'JESSELTON';
    const after = ev.split('-').slice(1).join('-').trim();
    if (/^web(site)?\b/.test(after)) res.source = 'Website';
    else if (/^(meta|fb|ig|facebook|instagram)\b/.test(after)) res.source = 'Meta';
    else warnings.push({ field: 'source', message: `Unknown source: "${after || '(kosong)'}"` });
  } else warnings.push({ field: 'event', message: `Unknown event: "${parts[1] ?? ''}"` });

  const d = (parts[2] ?? '').trim();
  if (parts.length > 3) warnings.push({ field: 'title', message: 'Title has more than 3 parts' });
  if (!UNDECIDED.test(d)) {
    const m = d.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
    if (!m) warnings.push({ field: 'visit_date', message: `Unrecognised date: "${d}"` });
    else if (res.event) {
      const year = EVENTS[res.event].year;
      const iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      const valid = !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && Number(m[2]) <= 12;
      if (!valid) warnings.push({ field: 'visit_date', message: `Invalid date: "${d}"` });
      else if (res.event === 'ROADSHOW') {
        const w = roadshowDateWarning(iso);
        if (w) warnings.push({ field: 'visit_date', message: w });
        res.visit_date = iso;
        res.visit_date_label = dateLabel(iso);
      } else if (iso !== EVENTS.JESSELTON.start_date) {
        warnings.push({ field: 'visit_date', message: `Jesselton is only on 28/11, found "${d}"` });
      }
    }
  }
  return res;
}

export function formatBitrixTitle(lead: Pick<Lead, 'event' | 'full_name' | 'source' | 'visit_date'>): string {
  if (lead.event === 'ROADSHOW') {
    const d = lead.visit_date ? `${lead.visit_date.slice(8, 10)}/${lead.visit_date.slice(5, 7)}` : 'TBC';
    return `${lead.full_name} | KL Property Roadshow Medan - Nov26 | ${d}`;
  }
  const src = lead.source === 'Website' ? 'Web' : 'Meta';
  return `${lead.full_name} | Jesselton Courtyard - ${src} | 28/11`;
}
