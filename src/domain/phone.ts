export interface PhoneResult { phone: string; invalid: boolean }

/** Normalize to digits-only E.164 without "+", Indonesian default (62). */
export function normalizePhone(raw: string | null | undefined): PhoneResult {
  let s = String(raw ?? '').trim();
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?wa\.me\//i, '').replace(/^api\.whatsapp\.com\/send\?phone=/i, '');
  s = s.split(/[?&]/)[0];
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.replace(/^0+/, '');
  else if (digits.startsWith('8')) digits = '62' + digits;
  const invalid = !digits.startsWith('62') || digits.length < 10 || digits.length > 15;
  return { phone: digits, invalid };
}

/** 6281234560570 -> 62812****0570 (for logs). */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  if (phone.length <= 8) return phone.slice(0, 2) + '****';
  return phone.slice(0, 5) + '****' + phone.slice(-4);
}
