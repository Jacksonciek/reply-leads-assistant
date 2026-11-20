import { describe, expect, it } from 'vitest';
import { SheetsStore } from '../src/worker/services/sheets';

describe('SheetsStore', () => {
  it('creates a missing tab on first write, then retries', async () => {
    const calls: string[] = [];
    const tabs = new Set(['Roadshow', 'Jesselton']);
    const fetchFn = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push(url.replace(/^.*\/SHEET/, ''));
      if (url.endsWith(':batchUpdate') && body.requests) {
        tabs.add(body.requests[0].addSheet.properties.title);
        return new Response('{}');
      }
      const tab = decodeURIComponent(url).match(/'([^']+)'/)?.[1] ?? body.data?.[0]?.range.match(/'([^']+)'/)?.[1];
      if (tab && !tabs.has(tab)) return new Response(`Unable to parse range: '${tab}'!A1:I1`, { status: 400 });
      return new Response('{}');
    }) as typeof fetch;
    const kv = { get: async () => 'tok', put: async () => {}, delete: async () => {} } as unknown as KVNamespace;
    const s = new SheetsStore({ sheetId: 'SHEET', saEmail: 'x', privateKeyPem: '', kv, fetchFn });

    await s.write('Messages', [{ row: 1, col: 1, values: ['msg_id', 'lead_id'] }]);
    await s.append('Config', [['k', 'v']]);

    expect(tabs.has('Messages')).toBe(true);
    expect(tabs.has('Config')).toBe(true);
    expect(calls.filter((c) => c === ':batchUpdate')).toHaveLength(2);
  });

  it('does not swallow other errors', async () => {
    const fetchFn = (async () => new Response('PERMISSION_DENIED', { status: 403 })) as typeof fetch;
    const kv = { get: async () => 'tok' } as unknown as KVNamespace;
    const s = new SheetsStore({ sheetId: 'SHEET', saEmail: 'x', privateKeyPem: '', kv, fetchFn });
    await expect(s.append('Messages', [['a']])).rejects.toThrow(/403/);
  });
});

describe('hand-made lead tabs (no system columns)', () => {
  it('adds the missing columns so lead ids stay stable between reads', async () => {
    const { MemoryStore } = await import('../src/worker/services/store');
    const { Repo } = await import('../src/worker/services/repo');
    const store = new MemoryStore();
    // Same header as an uploaded "List Leads.xlsx".
    store.tabs['Roadshow'] = [
      ['No', 'Name', 'Gender', 'Phone number', 'Email', 'Date', 'Status', 'Status in Bitrix'],
      ['1', 'Anita Zoelisa', 'Ibu', '081200002222', '', '', 'Belum chat', 'New'],
    ];
    const repo = new Repo(store);
    const first = await repo.leads();
    const second = await repo.leads();
    expect(first).toHaveLength(1);
    expect(second[0].lead_id).toBe(first[0].lead_id);
    expect((await repo.lead(first[0].lead_id)).full_name).toContain('Anita');
    // User columns and data are untouched; system columns are added after them.
    expect(store.tabs['Roadshow'][0].slice(0, 8)).toEqual(['No', 'Name', 'Gender', 'Phone number', 'Email', 'Date', 'Status', 'Status in Bitrix']);
    expect(store.tabs['Roadshow'][1].slice(0, 2)).toEqual(['1', 'Anita Zoelisa']);
  });
});
