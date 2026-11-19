// Grid storage abstraction (Google Sheets in production, memory for tests / local demo).
// Rows are 1-based like spreadsheets; row 1 is the header.

export interface CellUpdate { row: number; col: number; values: string[] } // col is 1-based start column

export interface Store {
  /** All values of a tab (header included). [] when the tab is empty or missing. */
  read(tab: string): Promise<string[][]>;
  /** Write several row fragments in one call. */
  write(tab: string, updates: CellUpdate[]): Promise<void>;
  append(tab: string, rows: string[][]): Promise<void>;
}

export class MemoryStore implements Store {
  tabs: Record<string, string[][]> = {};
  async read(tab: string) { return (this.tabs[tab] ?? []).map((r) => [...r]); }
  async write(tab: string, updates: CellUpdate[]) {
    const g = (this.tabs[tab] ??= []);
    for (const u of updates) {
      while (g.length < u.row) g.push([]);
      const r = g[u.row - 1];
      u.values.forEach((v, i) => { while (r.length < u.col - 1 + i) r.push(''); r[u.col - 1 + i] = v; });
    }
  }
  async append(tab: string, rows: string[][]) {
    const g = (this.tabs[tab] ??= []);
    // Like Sheets append: after the last non-empty row.
    let last = g.length;
    while (last > 0 && !g[last - 1].some((c) => c !== '')) last--;
    g.splice(last, g.length - last, ...rows.map((r) => [...r]));
  }
}

let memorySingleton: MemoryStore | null = null;
export function memoryStore(): MemoryStore {
  return (memorySingleton ??= new MemoryStore());
}

export type Obj = Record<string, string>;

/** Object view over a tab whose first row is the header. */
export class ObjTable {
  constructor(private store: Store, readonly tab: string, private defaultHeader: string[]) {}

  async load(): Promise<{ header: string[]; rows: { row: number; obj: Obj }[] }> {
    const g = await this.store.read(this.tab);
    const header = g[0]?.length ? g[0].map(String) : [];
    if (!header.length) {
      await this.store.write(this.tab, [{ row: 1, col: 1, values: this.defaultHeader }]);
      return { header: [...this.defaultHeader], rows: [] };
    }
    const rows = g.slice(1).map((r, i) => ({ row: i + 2, obj: Object.fromEntries(header.map((h, j) => [h, r[j] == null ? '' : String(r[j])])) }))
      .filter((x) => Object.values(x.obj).some((v) => v !== ''));
    return { header, rows };
  }

  async all(): Promise<Obj[]> { return (await this.load()).rows.map((r) => r.obj); }

  async append(objs: Obj[]): Promise<void> {
    if (!objs.length) return;
    const { header } = await this.load();
    await this.store.append(this.tab, objs.map((o) => header.map((h) => o[h] ?? '')));
  }

  /** Patch rows matching key=value. Returns the merged objects. */
  async update(key: string, value: string, patch: Obj): Promise<Obj | null> {
    const { header, rows } = await this.load();
    const hit = rows.find((r) => r.obj[key] === value);
    if (!hit) return null;
    const merged = { ...hit.obj, ...patch };
    await this.store.write(this.tab, [{ row: hit.row, col: 1, values: header.map((h) => merged[h] ?? '') }]);
    return merged;
  }

  async updateMany(key: string, patches: Map<string, Obj>): Promise<void> {
    if (!patches.size) return;
    const { header, rows } = await this.load();
    const updates = rows.filter((r) => patches.has(r.obj[key])).map((r) => {
      const merged = { ...r.obj, ...patches.get(r.obj[key]) };
      return { row: r.row, col: 1, values: header.map((h) => merged[h] ?? '') };
    });
    if (updates.length) await this.store.write(this.tab, updates);
  }
}
