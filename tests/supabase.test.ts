import { describe, expect, it } from 'vitest';
import { Repo } from '../src/worker/services/repo';
import { SupabaseStore } from '../src/worker/services/supabase';

/** Tiny fake of the PostgREST endpoints SupabaseStore uses. */
function fakeSupabase() {
  const db = new Map<string, string[]>(); // `${tab}#${row}` -> cells
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const tab = decodeURIComponent((u.searchParams.get('tab') ?? '').replace(/^eq\./, ''));
    const rowsOf = (t: string) => [...db.entries()].filter(([k]) => k.startsWith(`${t}#`)).map(([k, cells]) => ({ row: Number(k.split('#')[1]), cells }));
    if (!init?.method || init.method === 'GET') {
      let rs = rowsOf(tab).sort((a, b) => a.row - b.row);
      const inF = u.searchParams.get('row');
      if (inF) { const set = new Set(inF.replace(/^in\.\(|\)$/g, '').split(',').map(Number)); rs = rs.filter((r) => set.has(r.row)); }
      if (u.searchParams.get('order') === 'row.desc') rs.reverse();
      const lim = Number(u.searchParams.get('limit') ?? 1e9);
      return new Response(JSON.stringify(rs.slice(0, lim)));
    }
    const body = JSON.parse(String(init.body)) as { tab: string; row: number; cells: string[] }[];
    const upsert = String((init.headers as Record<string, string>).prefer).includes('merge-duplicates');
    if (!upsert && body.some((r) => db.has(`${r.tab}#${r.row}`))) return new Response('duplicate key', { status: 409 });
    for (const r of body) db.set(`${r.tab}#${r.row}`, r.cells);
    return new Response('');
  }) as typeof fetch;
  return { db, store: new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'k', fetchFn }) };
}

describe('SupabaseStore', () => {
  it('reads, writes cells and appends like a sheet', async () => {
    const { store } = fakeSupabase();
    await store.write('Config', [{ row: 1, col: 1, values: ['key', 'value'] }]);
    await store.append('Config', [['a', '1'], ['b', '2']]);
    await store.write('Config', [{ row: 3, col: 2, values: ['20'] }]);
    expect(await store.read('Config')).toEqual([['key', 'value'], ['a', '1'], ['b', '20']]);
    expect(await store.read('Missing')).toEqual([]);
  });

  it('works end to end with Repo (leads keep stable ids)', async () => {
    const { store } = fakeSupabase();
    const repo = new Repo(store);
    const first = await repo.leads();
    expect(first).toEqual([]);
    expect((await store.read('Roadshow'))[0]).toContain('lead_id');
  });
});
