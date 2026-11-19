// Load .dev.vars (KEY=value, optional quotes) into an object for local scripts.
import { existsSync, readFileSync } from 'node:fs';

export function loadDevVars(path = '.dev.vars'): Record<string, string> {
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
