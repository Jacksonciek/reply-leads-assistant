// Post-LLM guardrails. Pure function. Any violation => draft replaced by a fixed text upstream.

export interface GuardrailResult { ok: boolean; flags: string[] }

const CURRENCY = /\b(rp|rm|myr|idr|usd|sgd)\b|\brp\.?\s*\d/i;
const AMOUNT = /\d+([.,]\d+)?\s*(juta|jt|miliar|milyar|ribu|rb)\b|\d\s*M\b|%/i;
const AMOUNT_M = /\d\s*M\b/; // case-sensitive "M" (miliar) after number
const FORBIDDEN = [
  'harga', 'diskon', 'promo', 'cicilan', 'dp', 'kpr', 'roi', 'yield', 'untung', 'keuntungan', 'investasi pasti',
  'dijamin', 'garansi', 'unit tersedia', 'sisa unit', 'tipe unit', 'luas', 'sqft', 'kamar', 'mm2h', 'visa',
  'price', 'discount', 'installment', 'down payment', 'mortgage', 'guaranteed', 'bedroom',
];
const PHONE_OFFER = /(saya|aku|kami)\s+(akan\s+)?(telepon|telpon|tlp|call|hubungi\s+(via|lewat)\s+(telepon|telpon))|call\s+saya|i('ll| will)\s+call/i;
const URL = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+|\b[a-z0-9-]+\.(com|id|net|org|my|dev|co|io|me|ly)(\/[^\s)]*)?/gi;
const PHONE_NUM = /(\+?62|\b08)[\d\s-]{7,}|\b\d{9,}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const HUMAN_CLAIM = /\b(saya|aku)\s+(adalah\s+)?(manusia|orang\s+asli|bukan\s+(bot|robot|mesin|ai))|\bbukan\s+(bot|robot|mesin)\b|\bi('m| am)\s+(a\s+)?(real\s+)?(human|person)|\bnot\s+a\s+bot\b/i;
const EMOJI = /\p{Extended_Pictographic}/gu;
// Hard constraint 11: never offer the client to stop being contacted.
const OPT_OUT_OFFER = /tidak\s+dihubungi\s+lagi|tidak\s+ingin\s+dihubungi|berhenti\s+menghubungi|tidak\s+berkenan\s+dihubungi|saya\s+hormati/i;
// "we have recorded your attendance" style claims.
const ATTENDANCE_CLAIM = /(kami|saya)\s+(sudah\s+|telah\s+)?(catat|mencatat)\s+(kehadiran|kedatangan|reservasi|kunjungan)|(kehadiran|reservasi|kunjungan)\s+(\S+\s+){0,2}(sudah|telah)\s+(kami|saya)\s+catat/i;

export interface GuardrailCtx {
  intent?: string;
  projectLink?: string | null;
  maxLength?: number;
  /** Fixed texts OPT_OUT / SOURCE may say "tidak akan menghubungi lagi". */
  allowOptOutPhrase?: boolean;
  /** Client clearly stated attendance (KONF path). */
  attendanceStated?: boolean;
}

export function checkDraft(text: string, ctx: GuardrailCtx = {}): GuardrailResult {
  const flags: string[] = [];
  const t = text ?? '';
  const lower = t.toLowerCase();
  if (CURRENCY.test(t)) flags.push('currency');
  if (AMOUNT.test(t.replace(AMOUNT_M, '')) || AMOUNT_M.test(t)) flags.push('amount');
  for (const w of FORBIDDEN) {
    const re = new RegExp(`(^|[^\\p{L}])${w.replace(/\s+/g, '\\s+')}($|[^\\p{L}])`, 'iu');
    if (re.test(lower)) flags.push(`forbidden:${w}`);
  }
  if (PHONE_OFFER.test(t)) flags.push('phone_offer');
  const allowed = (ctx.projectLink ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  for (const m of t.matchAll(URL)) {
    const u = m[0].replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    if (!allowed || !u.startsWith(allowed)) flags.push('link');
  }
  if (PHONE_NUM.test(t.replace(URL, ''))) flags.push('phone_number');
  if (EMAIL.test(t)) flags.push('email');
  if (ctx.intent === 'ASK_IF_BOT' && HUMAN_CLAIM.test(t)) flags.push('human_claim');
  if (t.length > (ctx.maxLength ?? 600)) flags.push('too_long');
  if ((t.match(EMOJI) ?? []).length > 1) flags.push('emoji');
  if (!ctx.allowOptOutPhrase && OPT_OUT_OFFER.test(t)) flags.push('opt_out_offer');
  if (!ctx.attendanceStated && ATTENDANCE_CLAIM.test(t)) flags.push('attendance_claim');
  if (!t.trim()) flags.push('empty');
  return { ok: flags.length === 0, flags: [...new Set(flags)] };
}

export const FLAG_LABEL: Record<string, string> = {
  currency: 'mentions a currency', amount: 'mentions a number/price', phone_offer: 'offers a phone call from me',
  link: 'link other than the project link', phone_number: 'phone number', email: 'email address', human_claim: 'claims to be human without help',
  too_long: 'too long (> 600 characters)', emoji: 'more than one emoji', empty: 'empty draft',
  opt_out_offer: 'offers the client to stop messages', attendance_claim: 'claims attendance is recorded when it is not clear',
};

export function flagLabel(f: string): string {
  if (f.startsWith('forbidden:')) return `kata terlarang "${f.slice(10)}"`;
  return FLAG_LABEL[f] ?? f;
}

/** Product-ish violations fall back to HANDOFF_PA, everything else to HOLD. */
export function fallbackFor(flags: string[], intent?: string): string {
  if (intent === 'ASK_IF_BOT') return 'ASK_IF_BOT';
  return flags.some((f) => f === 'currency' || f === 'amount' || f.startsWith('forbidden:')) ? 'HANDOFF_PA' : 'HOLD';
}
