// Supabase (Postgres) store. Keeps the same grid model as Google Sheets so Repo stays unchanged:
// every tab row is one record in `sheet_rows` (see supabase/schema.sql). Uses the PostgREST API with the
// service-role key, which must only ever live in server-side env vars.
import type { CellUpdate, Store } from './store';

export interface SupabaseOpts { url: string; serviceKey: string; fetchFn?: typeof fetch }

interface RowRec { row: number; cells: string[] }

const PAGE = 1000; // PostgREST default max rows per request

export class SupabaseStore implements Store {
  private fetchFn: typeof fetch;
  constructor(private o: SupabaseOpts) { this.fetchFn = o.fetchFn ?? fetch.bind(globalThis); }

  private async call<T>(query: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${this.o.url.replace(/\/$/, '')}/rest/v1/sheet_rows${query}`, {
      ...init,
      headers: {
        apikey: this.o.serviceKey, authorization: `Bearer ${this.o.serviceKey}`, 'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async rows(tab: string, filter = ''): Promise<RowRec[]> {
    const out: RowRec[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await this.call<RowRec[]>(`?select=row,cells&tab=eq.${encodeURIComponent(tab)}${filter}&order=row`, {
        headers: { range: `${from}-${from + PAGE - 1}` },
      });
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }

  async read(tab: string): Promise<string[][]> {
    const g: string[][] = [];
    for (const r of await this.rows(tab)) {
      while (g.length < r.row - 1) g.push([]);
      g[r.row - 1] = r.cells ?? [];
    }
    return g;
  }

  async write(tab: string, updates: CellUpdate[]): Promise<void> {
    if (!updates.length) return;
    const nums = [...new Set(updates.map((u) => u.row))];
    const existing = new Map((await this.rows(tab, `&row=in.(${nums.join(',')})`)).map((r) => [r.row, [...(r.cells ?? [])]]));
    for (const u of updates) {
      const r = existing.get(u.row) ?? [];
      u.values.forEach((v, i) => { while (r.length < u.col - 1 + i) r.push(''); r[u.col - 1 + i] = v; });
      existing.set(u.row, r);
    }
    await this.call('', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(nums.map((row) => ({ tab, row, cells: existing.get(row) }))),
    });
  }

  async append(tab: string, rows: string[][]): Promise<void> {
    if (!rows.length) return;
    // Plain insert (no upsert): if two appends race for the same row numbers, the loser gets 409 and retries.
    for (let attempt = 0; ; attempt++) {
      const last = await this.call<RowRec[]>(`?select=row&tab=eq.${encodeURIComponent(tab)}&order=row.desc&limit=1`);
      const start = (last[0]?.row ?? 0) + 1;
      try {
        await this.call('', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(rows.map((cells, i) => ({ tab, row: start + i, cells }))) });
        return;
      } catch (e) {
        if (!/Supabase 409/.test((e as Error).message) || attempt >= 4) throw e;
      }
    }
  }
}
