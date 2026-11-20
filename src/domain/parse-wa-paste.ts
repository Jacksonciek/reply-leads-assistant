// Split text copied from WhatsApp into messages (Section 11.1). Supports Android export lines,
// iOS "[date time] Name: text" lines and the "[time, date] Name: text" format from copying selected messages.
import { fromWib } from './time';
import type { Direction } from './types';

export interface PastedMessage { direction: Direction; text: string; sent_at: string | null; sender: string }

const D = String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})`;
const T = String.raw`(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?`;
// [date, time] Name: text  |  date, time - Name: text
const DATE_FIRST = new RegExp(String.raw`^\[?${D},?\s+${T}\]?\s*(?:-\s*)?([^:]{1,120}?):\s?([\s\S]*)$`);
// [time, date] Name: text
const TIME_FIRST = new RegExp(String.raw`^\[${T},?\s+${D}\]\s*([^:]{1,120}?):\s?([\s\S]*)$`);

function toIso(day: string, month: string, year: string, hh: string, mm: string, ap?: string, us = false): string | null {
  if (us) [day, month] = [month, day];
  let y = Number(year);
  if (y < 100) y += 2000;
  let h = Number(hh);
  if (ap) {
    const pm = ap.toLowerCase() === 'p';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const mo = Number(month), d = Number(day), mi = Number(mm);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return fromWib(date, h, mi).toISOString();
}

interface Head { sender: string; text: string; sent_at: string | null }

function parseHead(line: string, us = false): Head | null {
  let m = line.match(TIME_FIRST);
  if (m) return { sent_at: toIso(m[5], m[6], m[7], m[1], m[2], m[4], us), sender: m[8].trim(), text: m[9] };
  m = line.match(DATE_FIRST);
  if (m) return { sent_at: toIso(m[1], m[2], m[3], m[4], m[5], m[7], us), sender: m[8].trim(), text: m[9] };
  return null;
}

// Exports from US-locale phones write month/day ("11/19/26"). Decide once for the whole paste.
function isMonthFirst(text: string): boolean {
  for (const m of text.matchAll(new RegExp(String.raw`^\[?${D}`, 'gm'))) {
    if (Number(m[1]) > 12) return false;
    if (Number(m[2]) > 12) return true;
  }
  return false;
}
const SELF = new Set(['you', 'anda', 'kamu', 'saya']);
const SYSTEM = /end-to-end encrypted|dienkripsi secara end-to-end/i;
// "<image omitted>" / "<Media omitted>": a photo was sent with this message.
const MEDIA = /^\s*(<[^>]*omitted>|<[^>]*tidak disertakan>|image omitted|gambar tidak disertakan)\s*/i;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Chat written without timestamps: "Pak Bolon: Ok, terima kasih" / "Saya: Sama-sama, Pak". Only the first
// speaker (or a Pak/Bu/Ibu name) counts as the client, so "Informasi proyek: https://…" stays inside a message.
const SPEAKER = /^([^:\n]{1,40}):\s?(.*)$/;
function parseSpeakers(text: string, me: string): PastedMessage[] | null {
  const lines = text.split('\n');
  if (!SPEAKER.test(lines[0])) return null;
  const isSelf = (n: string) => SELF.has(norm(n)) || (!!me && norm(n) === me);
  const client = new Set<string>();
  const out: PastedMessage[] = [];
  for (const line of lines) {
    const m = line.match(SPEAKER);
    const self = !!m && isSelf(m[1]);
    const known = !!m && (self || client.has(norm(m[1])) || (!client.size && (!out.length || /^(pak|bapak|bu|ibu|klien|client)\b/i.test(m[1].trim()))));
    if (m && known) {
      if (!self) client.add(norm(m[1]));
      out.push({ direction: self ? 'OUT' : 'IN', text: m[2], sent_at: null, sender: m[1].trim() });
    } else if (out.length) out[out.length - 1].text += `\n${line}`;
  }
  if (!out.some((m) => m.direction === 'OUT')) return null;
  return out.map((m) => ({ ...m, text: m.text.trim() })).filter((m) => m.text !== '');
}

export function parseWaPaste(raw: string, myName = 'Jackson'): PastedMessage[] {
  const text = String(raw ?? '').replace(/[‎‏‪-‮]/g, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const me = norm(myName);
  const out: PastedMessage[] = [];
  let sawHead = false;
  if (!text.split('\n').some((l) => parseHead(l))) {
    const simple = parseSpeakers(text, me);
    if (simple) return simple;
  }
  const us = isMonthFirst(text);
  for (const line of text.split('\n')) {
    if (SYSTEM.test(line)) continue;
    const h = parseHead(line, us);
    if (h) {
      sawHead = true;
      const isMe = SELF.has(norm(h.sender)) || (!!me && (norm(h.sender) === me || norm(h.sender).startsWith(me)));
      const body = MEDIA.test(h.text) ? `[Foto] ${h.text.replace(MEDIA, '')}` : h.text;
      out.push({ direction: isMe ? 'OUT' : 'IN', text: body, sent_at: h.sent_at, sender: h.sender });
    } else if (out.length) {
      out[out.length - 1].text += `\n${line}`;
    } else if (!sawHead) {
      out.push({ direction: 'IN', text: line, sent_at: null, sender: '' });
    }
  }
  return out.map((m) => ({ ...m, text: m.text.trim() })).filter((m) => m.text !== '');
}
