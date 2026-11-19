import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { parseSheetRows, type ParsedRow } from '../src/domain/parse-excel-row';

export const EXCEL_PATH = resolve(__dirname, '../data/Roadshow__Jesselton.xlsx');
export const hasExcel = existsSync(EXCEL_PATH);

export function loadExcel(): { roadshow: ParsedRow[]; jesselton: ParsedRow[] } {
  const wb = XLSX.read(readFileSync(EXCEL_PATH), { type: 'buffer' });
  const rows = (name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '', raw: false });
  return { roadshow: parseSheetRows('Roadshow', rows('Roadshow')), jesselton: parseSheetRows('Jesselton', rows('Jesselton')) };
}

/** 19 Nov 2026 10:00 WIB */
export const NOW = new Date('2026-11-19T03:00:00Z');
