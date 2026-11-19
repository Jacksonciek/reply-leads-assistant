import type { Gender } from './types';

export interface CallNameResult { callName: string; agentName: string; needsReview: boolean }

const KEEP_TITLES = /^(dr\.?|drg\.?|prof\.?)$/i;
const DROP_TITLES = /^(ir\.?|h\.?|hj\.?|drs\.?|dra\.?|bpk\.?|bapak|ibu|bu|pak|mr\.?|mrs\.?|ms\.?|tn\.?|ny\.?|sdr\.?|sdri\.?)$/i;
const NAME_PREFIXES = /^(muhammad|muhamad|muhammed|mohammad|mohamad|mohammed|moh\.?|mohd\.?|muh\.?|m\.?)$/i;
// Common North Sumatra family names (marga). A single-word name in this list probably isn't a given name.
const FAMILY_NAMES = new Set([
  'siregar', 'nasution', 'harahap', 'lubis', 'hasibuan', 'sitepu', 'tarigan', 'ginting', 'sembiring', 'karo-karo',
  'perangin-angin', 'simanjuntak', 'sinaga', 'silitonga', 'hutapea', 'panjaitan', 'pardede', 'manurung', 'simbolon',
  'sihombing', 'situmorang', 'sitorus', 'siahaan', 'simatupang', 'napitupulu', 'pasaribu', 'hutagalung', 'gulo',
  'zebua', 'limbong', 'saragih', 'purba', 'damanik', 'banjarnahor', 'siboro', 'siboroh', 'sinuhaji', 'matondang',
  'pohan', 'daulay', 'ritonga', 'rangkuti', 'batubara', 'tambunan', 'marpaung', 'sianturi', 'butar-butar',
]);

function titleCaseWord(w: string): string {
  if (KEEP_TITLES.test(w)) return w;
  const isUpper = w === w.toUpperCase();
  const isLower = w === w.toLowerCase();
  if (!isUpper && !isLower) return w; // mixed case like QiuQiu: keep
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Derive a call name ("Defi", "dr. Defi") and agent name from a raw lead name. */
export function deriveCallName(fullName: string): CallNameResult {
  let s = String(fullName ?? '').replace(/\s+/g, ' ').trim();
  let agentName = '';
  const paren = s.match(/\(([^()]*)\)(?!.*\()/);
  if (paren) {
    agentName = paren[1].trim();
    s = (s.slice(0, paren.index) + s.slice(paren.index! + paren[0].length)).replace(/\s+/g, ' ').trim();
  }
  // Trailing degrees after a comma: ", S.E.", ", M. Biomed", ", MBA"
  s = s.split(',')[0].trim();

  const tokens = s.split(' ').filter(Boolean);
  const keep: string[] = [];
  let needsReview = false;
  while (tokens.length > 1) {
    if (KEEP_TITLES.test(tokens[0])) keep.push(tokens.shift()!);
    else if (DROP_TITLES.test(tokens[0])) tokens.shift();
    else break;
  }
  if (tokens.length === 0) return { callName: keep.join(' '), agentName, needsReview: true };

  let first = tokens[0];
  if (NAME_PREFIXES.test(first) && tokens.length > 1) {
    first = tokens[1];
    needsReview = true;
  }
  const letters = first.replace(/[^\p{L}]/gu, '');
  if (letters.length <= 2) needsReview = true;
  // Single short word (e.g. "Moan") may be a nickname or family name: ask Jackson to check.
  if (tokens.length === 1 && (FAMILY_NAMES.has(first.toLowerCase()) || letters.length <= 4)) needsReview = true;

  const callName = [...keep, titleCaseWord(first)].join(' ');
  return { callName, agentName, needsReview };
}

export function sapaanFor(gender: Gender | string): { sapaan: string; sapaan_pendek: string } {
  if (gender === 'Bapak') return { sapaan: 'Bapak', sapaan_pendek: 'Pak' };
  if (gender === 'Ibu') return { sapaan: 'Ibu', sapaan_pendek: 'Bu' };
  return { sapaan: 'Bapak/Ibu', sapaan_pendek: 'Pak/Bu' };
}

export function normalizeGender(raw: unknown): Gender {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['bapak', 'pak', 'bpk', 'male', 'laki-laki', 'l', 'mr'].includes(s)) return 'Bapak';
  if (['ibu', 'bu', 'female', 'perempuan', 'p', 'mrs', 'ms'].includes(s)) return 'Ibu';
  return '';
}
