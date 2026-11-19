// Data minimisation before anything is sent to the LLM (Hard constraint 8).

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// +62 / 62 / 08 numbers, or any run of 9+ digits allowing spaces, dots and dashes in between.
const PHONE = /(\+?\d[\d\s.-]{7,}\d)/g;

export function redactText(text: string): string {
  return String(text ?? '')
    .replace(EMAIL, '(email disamarkan)')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '(nomor disamarkan)' : m));
}

/** Remove exact occurrences of sensitive strings (full name, agent name) from text. */
export function stripNames(text: string, names: string[]): string {
  let out = text;
  for (const n of names) {
    const t = n.trim();
    if (t.length < 3) continue;
    out = out.split(t).join('(nama disamarkan)');
  }
  return out;
}
