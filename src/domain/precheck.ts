// Deterministic pre-LLM checks (Section 11.2).

const OPT_OUT = /\b(stop|berhenti|unsubscribe|unsub)\b|\b(jangan|tidak\s+usah|tdk\s+usah|gak\s+usah|ga\s+usah|nggak\s+usah|ngga\s+usah|gausah|gk\s+usah)\s+(di\s*)?(hubungi|chat|wa|whatsapp|telp|telepon|kirim|ganggu)|\bhapus\s+(nomor|no)\b|\bdon'?t\s+(contact|message|text)\s+me\b/i;

export function isOptOut(text: string): boolean {
  return OPT_OUT.test(text ?? '');
}

const SHORT_TOKENS = new Set([
  'ok', 'oke', 'okay', 'okey', 'okee', 'okk', 'okeh', 'sip', 'siap', 'baik', 'terima', 'kasih', 'terimakasih', 'makasih',
  'makasi', 'trims', 'tks', 'thx', 'thanks', 'thank', 'you', 'ty', 'tq', 'pak', 'bu', 'buk', 'noted', 'mas', 'kak',
  'bang', 'ya', 'iya', 'yaa', 'baiklah',
]);
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️\s]+$/u;

/** Short acknowledgement only ("ok", "terima kasih", 👍). Not an attendance confirmation. */
export function isShortAck(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (EMOJI_ONLY.test(t)) return true;
  const words = t.toLowerCase().replace(/[\p{Extended_Pictographic}‍️]/gu, ' ').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // "ya"/"iya" alone answers a yes/no question (A-R1 asks to reply "Ya"): not a short ack.
  if (words.every((w) => ['ya', 'iya', 'yaa'].includes(w))) return false;
  return words.length > 0 && words.length <= 6 && words.every((w) => SHORT_TOKENS.has(w));
}

const MEDIA = /<\s*(media omitted|media tidak disertakan|media dihilangkan)\s*>|\b(audio|image|video|sticker|gif|document|gambar|stiker|dokumen)\s+(omitted|tidak disertakan|dihilangkan)\b|‎?(image|audio|video|sticker|document) omitted/i;

export function hasMedia(text: string): boolean {
  return MEDIA.test(text ?? '');
}
