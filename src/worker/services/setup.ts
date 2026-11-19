// Idempotent sheet setup: tabs, headers, system-column styling/notes/grouping, dropdowns, default templates.
import { EVENTS, EVENT_CODES } from '../../../config/events';
import { DEFAULT_TEMPLATES } from '../../../config/templates';
import { DATE_OPTIONS, GUEST_OPTIONS, leadColumns, SYSTEM_COLUMNS, TIME_OPTIONS, VISIBLE_COLUMNS } from '../../domain/sheet-row';
import { CONFIG_COLUMNS, DRAFT_COLUMNS, FAQ_COLUMNS, MESSAGE_COLUMNS, STATUS_OPTIONS, TEMPLATE_COLUMNS } from '../../domain/types';
import type { SheetsStore } from './sheets';
import type { Store } from './store';
import { CONFIG_DEFAULTS } from './repo';

export const AUX_TABS: Record<string, string[]> = {
  Messages: MESSAGE_COLUMNS,
  Drafts: DRAFT_COLUMNS,
  FAQ: FAQ_COLUMNS,
  Templates: TEMPLATE_COLUMNS,
  Config: CONFIG_COLUMNS,
};

function isSheets(s: Store): s is SheetsStore {
  return typeof (s as SheetsStore).batchUpdate === 'function';
}

export async function setupSheet(store: Store, now = new Date()): Promise<string[]> {
  const log: string[] = [];
  const wanted: Record<string, string[]> = { ...AUX_TABS };
  for (const ev of EVENT_CODES) wanted[EVENTS[ev].sheet_tab] = leadColumns(ev);

  if (isSheets(store)) {
    const existing = new Set((await store.meta()).sheets.map((s) => s.properties.title));
    const missing = Object.keys(wanted).filter((t) => !existing.has(t));
    await store.batchUpdate(missing.map((title) => ({ addSheet: { properties: { title } } })));
    missing.forEach((t) => log.push(`Tab ${t} dibuat`));
  }

  // Headers: keep existing order, append missing columns at the end.
  for (const [tab, cols] of Object.entries(wanted)) {
    const g = await store.read(tab);
    const head = g[0] ?? [];
    const add = cols.filter((c) => !head.includes(c));
    if (add.length) {
      await store.write(tab, [{ row: 1, col: head.length + 1, values: add }]);
      log.push(`${tab}: kolom ditambahkan (${add.join(', ')})`);
    }
  }

  // Seed templates / config defaults that are missing.
  const tpl = await store.read('Templates');
  const haveTpl = new Set(tpl.slice(1).map((r) => r[0]));
  const newTpl = DEFAULT_TEMPLATES.filter((t) => !haveTpl.has(t.code));
  if (newTpl.length) {
    await store.append('Templates', newTpl.map((t) => [t.code, t.event, t.body, t.status, now.toISOString()]));
    log.push(`Templates: ${newTpl.length} template default ditambahkan`);
  }
  const cfg = await store.read('Config');
  const haveCfg = new Set(cfg.slice(1).map((r) => r[0]));
  const newCfg = Object.entries(CONFIG_DEFAULTS).filter(([k]) => !haveCfg.has(k));
  if (newCfg.length) {
    await store.append('Config', newCfg);
    log.push(`Config: ${newCfg.length} nilai default ditambahkan`);
  }

  if (isSheets(store)) {
    const ids = new Map((await store.meta()).sheets.map((s) => [s.properties.title, s.properties.sheetId]));
    const requests: unknown[] = [];
    for (const ev of EVENT_CODES) {
      const tab = EVENTS[ev].sheet_tab;
      const sheetId = ids.get(tab)!;
      const head = (await store.read(tab))[0] ?? [];
      const col = (name: string) => head.indexOf(name);
      const dropdown = (name: string, values: string[]) => {
        const c = col(name);
        if (c < 0) return;
        requests.push({
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: c, endColumnIndex: c + 1 },
            rule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
          },
        });
      };
      dropdown('Status', STATUS_OPTIONS);
      dropdown('Gender', ['Bapak', 'Ibu']);
      if (ev === 'ROADSHOW') dropdown('Date', [...DATE_OPTIONS, 'Belum pasti']);
      else { dropdown('Time', TIME_OPTIONS); dropdown('Guest', GUEST_OPTIONS); dropdown('Website / Meta', ['Website', 'Meta']); }

      const sysCols = SYSTEM_COLUMNS.map(col).filter((c) => c >= 0);
      const first = Math.min(...sysCols), last = Math.max(...sysCols) + 1;
      requests.push(
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: VISIBLE_COLUMNS[ev].length },
            cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: first, endColumnIndex: last },
            cell: { userEnteredFormat: { backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 }, textFormat: { foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } } }, note: 'Kolom sistem: jangan diedit' },
            fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor),note',
          },
        },
      );
    }
    await store.batchUpdate(requests);
    // Grouping fails if the group already exists: try separately and ignore that error.
    for (const ev of EVENT_CODES) {
      const tab = EVENTS[ev].sheet_tab;
      const head = (await store.read(tab))[0] ?? [];
      const sys = SYSTEM_COLUMNS.map((c) => head.indexOf(c)).filter((c) => c >= 0);
      try {
        await store.batchUpdate([
          { addDimensionGroup: { range: { sheetId: ids.get(tab), dimension: 'COLUMNS', startIndex: Math.min(...sys), endIndex: Math.max(...sys) + 1 } } },
        ]);
        await store.batchUpdate([
          { updateDimensionGroup: { dimensionGroup: { range: { sheetId: ids.get(tab), dimension: 'COLUMNS', startIndex: Math.min(...sys), endIndex: Math.max(...sys) + 1 }, depth: 1, collapsed: true }, fields: 'collapsed' } },
        ]);
        log.push(`${tab}: kolom sistem dikelompokkan dan disembunyikan`);
      } catch { /* group exists already */ }
    }
    log.push('Dropdown, warna header, dan catatan kolom sistem diperbarui');
  }
  return log;
}
