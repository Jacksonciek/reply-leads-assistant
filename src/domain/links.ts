export type LinkFormat = 'wa.me' | 'android_business';

/** Click-to-send link that opens a chat with prefilled text. Nothing is sent until Jackson taps Send. */
export function clickToSendLink(phone: string, text: string, format: LinkFormat = 'wa.me'): string {
  const p = phone.replace(/\D/g, '');
  const encoded = encodeURIComponent(text);
  if (format === 'android_business') {
    return `intent://send?phone=${p}&text=${encoded}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
  }
  return `https://wa.me/${p}?text=${encoded}`;
}

/** Normalize text for echo matching (whitespace-insensitive). */
export function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
