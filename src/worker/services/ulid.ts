// Minimal ULID (time-sortable id). Avoids a dependency.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(time = Date.now()): string {
  let t = time, ts = '';
  for (let i = 0; i < 10; i++) { ts = ALPHABET[t % 32] + ts; t = Math.floor(t / 32); }
  const rnd = crypto.getRandomValues(new Uint8Array(16));
  let r = '';
  for (let i = 0; i < 16; i++) r += ALPHABET[rnd[i] % 32];
  return ts + r;
}
