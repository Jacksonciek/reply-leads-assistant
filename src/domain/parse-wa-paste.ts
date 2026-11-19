// Split text copied from WhatsApp into messages (Section 11.1). Supports Android export lines,
// iOS "[date time] Name: text" lines and the "[time, date] Name: text" format from copying selected messages.
import { fromWib } from './time';
import type { Direction } from './types';

export interface PastedMessage { direction: Direction; text: string; sent_at: string | null; sender: string }

const D = String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})`;
const T = String.raw`(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?`;
// [date, time] Name: text  |  date, time - Name: text
const DATE_FIRST = new RegExp(String.raw`^\[?${D},?\s+${T}\]?\s*(?:-\s*)?([^:]{1,60}?):\s?([\s\S]*)$`);
// [time, date] Name: text
const TIME_FIRST = new RegExp(String.raw`^\[${T},?\s+${D}\]\s*([^:]{1,60}?):\s?([\s\S]*)$`);

function toIso(day: string, month: string, year: string, hh: string, mm: string, ap?: string): string | null {
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

function parseHead(line: string): Head | null {
  let m = line.match(TIME_FIRST);
  if (m) return { sent_at: toIso(m[5], m[6], m[7], m[1], m[2], m[4]), sender: m[8].trim(), text: m[9] };
  m = line.match(DATE_FIRST);
  if (m) return { sent_at: toIso(m[1], m[2], m[3], m[4], m[5], m[7]), sender: m[8].trim(), text: m[9] };
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function parseWaPaste(raw: string, myName = 'Jackson'): PastedMessage[] {
  const text = String(raw ?? '').replace(/[‎‏‪-‮]/g, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const me = norm(myName);
  const out: PastedMessage[] = [];
  let sawHead = false;
  for (const line of text.split('\n')) {
    const h = parseHead(line);
    if (h) {
      sawHead = true;
      const isMe = !!me && (norm(h.sender) === me || norm(h.sender).startsWith(me));
      out.push({ direction: isMe ? 'OUT' : 'IN', text: h.text, sent_at: h.sent_at, sender: h.sender });
    } else if (out.length) {
      out[out.length - 1].text += `\n${line}`;
    } else if (!sawHead) {
      out.push({ direction: 'IN', text: line, sent_at: null, sender: '' });
    }
  }
  return out.map((m) => ({ ...m, text: m.text.trim() })).filter((m) => m.text !== '');
}
