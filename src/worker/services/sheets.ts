// Google Sheets API v4 store with a service account (JWT RS256 via WebCrypto).
import type { CellUpdate, Store } from './store';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetsOpts {
  sheetId: string;
  saEmail: string;
  privateKeyPem: string;
  kv?: KVNamespace;
  fetchFn?: typeof fetch;
}

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  let bin: string;
  try { bin = atob(body); } catch {
    throw new Error('GOOGLE_SA_PRIVATE_KEY is invalid. Paste the full "private_key" value from the service account JSON file (it is long, ~1,700 characters).');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function signServiceAccountJwt(email: string, pem: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

export function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SheetsStore implements Store {
  private token: string | null = null;
  private headers = new Map<string, string[]>();
  private fetchFn: typeof fetch;
  constructor(private o: SheetsOpts) { this.fetchFn = o.fetchFn ?? fetch.bind(globalThis); }

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;
    const cached = await this.o.kv?.get('gtoken');
    if (cached) return (this.token = cached);
    const jwt = await signServiceAccountJwt(this.o.saEmail, this.o.privateKeyPem);
    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
    });
    if (!res.ok) throw new Error(`Google token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { access_token: string };
    this.token = data.access_token;
    await this.o.kv?.put('gtoken', data.access_token, { expirationTtl: 55 * 60 });
    return data.access_token;
  }

  /** Request with backoff on 429/5xx. */
  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(`${API}/${this.o.sheetId}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(500 * 2 ** attempt); continue; }
      if (res.status === 401 && attempt === 0) { this.token = null; await this.o.kv?.delete('gtoken'); continue; }
      throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }

  async read(tab: string): Promise<string[][]> {
    try {
      const data = await this.call<{ values?: unknown[][] }>(`/values/${encodeURIComponent(`'${tab}'`)}?valueRenderOption=FORMATTED_VALUE`);
      return (data.values ?? []).map((r) => r.map((c) => (c == null ? '' : String(c))));
    } catch (e) {
      if (/Unable to parse range/.test((e as Error).message)) return [];
      throw e;
    }
  }

  /** Run a write; if the tab does not exist yet, create it once and retry. */
  private async withTab<T>(tab: string, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) {
      if (!/Unable to parse range/.test((e as Error).message)) throw e;
      try { await this.batchUpdate([{ addSheet: { properties: { title: tab } } }]); } catch (e2) {
        // Another request created it at the same moment: fine, just retry the write.
        if (!/already exists/.test((e2 as Error).message)) throw e2;
      }
      return fn();
    }
  }

  async write(tab: string, updates: CellUpdate[]): Promise<void> {
    if (!updates.length) return;
    await this.withTab(tab, () => this.call('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: updates.map((u) => ({
          range: `'${tab}'!${colLetter(u.col)}${u.row}:${colLetter(u.col + u.values.length - 1)}${u.row}`,
          values: [u.values],
        })),
      }),
    }));
  }

  async append(tab: string, rows: string[][]): Promise<void> {
    if (!rows.length) return;
    await this.withTab(tab, () => this.call(`/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: rows }),
    }));
  }

  /** Raw spreadsheet metadata / batchUpdate access for the setup script. */
  async meta(): Promise<{ sheets: { properties: { sheetId: number; title: string } }[] }> {
    return this.call('?fields=sheets.properties(sheetId,title)');
  }

  async batchUpdate(requests: unknown[]): Promise<void> {
    if (requests.length) await this.call(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  }
}
