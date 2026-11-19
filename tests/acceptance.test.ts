// Acceptance table (Section 7) against the real Excel. Skipped when the (gitignored) file is absent.
// Assertions use names/cases only; phone numbers never appear in output or snapshots.
import { describe, expect, it } from 'vitest';
import { EVENTS } from '../config/events';
import { DEFAULT_TEMPLATES } from '../config/templates';
import { resolveCase } from '../src/domain/cases';
import { sapaanFor } from '../src/domain/names';
import { buildVars, renderTemplate, type TemplateMap } from '../src/domain/templates';
import { hasExcel, loadExcel, NOW } from './helpers';

const TPL: TemplateMap = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.code, t]));

describe.skipIf(!hasExcel)('acceptance: Excel asli', () => {
  const data = hasExcel ? loadExcel() : { roadshow: [], jesselton: [] };

  it('row counts (17 Roadshow incl. Haura, 22 Jesselton)', () => {
    expect(data.roadshow).toHaveLength(17);
    expect(data.jesselton).toHaveLength(22);
    for (const r of [...data.roadshow, ...data.jesselton]) expect(r.lead.phone_invalid).toBe(false);
  });

  const roadshow: [number, string, string, string, string, boolean?][] = [
    [1, 'A-R1', 'Ibu Anita', 'Calvin Kok', 'Senin, 23 November 2026'],
    [2, 'X', 'Bapak Roy', '', 'Rabu, 25 November 2026'],
    [3, 'X', 'Ibu Sri', '', ''],
    [4, 'A-R2', 'Ibu Agustina', '', ''],
    [5, 'A-R2', 'Bapak Marnold', '', ''],
    [6, 'CONV', 'Bapak Partahi', '', 'Senin, 23 November 2026'],
    [7, 'A-R2', 'Ibu Jumita', '', ''],
    [8, 'A-R1', 'Ibu Moan', '', 'Minggu, 29 November 2026', true],
    [9, 'A2', 'Ibu Trifena', '', ''],
    [10, 'A2', 'Bapak Ramlan', 'Daniel Tan', ''],
    [11, 'A2', 'Ibu dr. Defi', '', ''],
    [12, 'A2', 'Bapak Deny', '', ''],
    [13, 'A2', 'Ibu Ella', '', ''],
    [14, 'A2', 'Bapak Rusdi', 'Daniel Tan', '', true],
    [15, 'A1', 'Bapak Ruslan', '', 'Rabu, 25 November 2026'],
    [16, 'A2', 'Bapak Dedek', '', ''],
    [17, 'X', 'Ibu Haura', '', ''],
  ];
  it.each(roadshow)('Roadshow #%d -> %s', (no, code, greet, agent, label, review) => {
    const { lead } = data.roadshow[no - 1];
    expect(resolveCase(lead, NOW).code).toBe(code);
    expect(`${sapaanFor(lead.gender).sapaan} ${lead.call_name}`).toBe(greet);
    expect(lead.agent_name).toBe(agent);
    expect(lead.visit_date_label).toBe(label);
    if (review !== undefined) expect(lead.call_name_needs_review).toBe(review);
  });

  const jesselton: Record<number, [string, string?]> = {
    1: ['B4'], 2: ['B4'], 18: ['B4'],
    3: ['B2', '3plus'], 5: ['B2', '3plus'], 7: ['B2', '3plus'],
    22: ['B2', 'empty'],
    4: ['B1'], 6: ['B1'], 8: ['B1'], 10: ['B1'], 12: ['B1'], 14: ['B1'], 15: ['B1'], 16: ['B1'], 20: ['B1'], 21: ['B1'],
    9: ['B5'], 11: ['B5'], 13: ['B5'], 17: ['B5'],
    19: ['X'],
  };
  it.each(Object.entries(jesselton).map(([n, v]) => [Number(n), ...v] as const))('Jesselton #%d -> %s', (no, code, variant) => {
    const { lead } = data.jesselton[no - 1];
    const c = resolveCase(lead, NOW);
    expect(c.code).toBe(code);
    if (variant) expect(c.variant).toBe(variant);
  });
  it('Su Kardi needs review; Mahyuni is Ibu; Dygka from Website', () => {
    expect(data.jesselton[18].lead.call_name_needs_review).toBe(true);
    expect(data.jesselton[6].lead.gender).toBe('Ibu');
    expect(data.jesselton[21].lead.source).toBe('Website');
  });

  it('every actionable lead renders its template without leftovers', () => {
    for (const { lead } of [...data.roadshow, ...data.jesselton]) {
      const c = resolveCase(lead, NOW);
      if (!c.template) continue;
      const text = renderTemplate(c.template, TPL, buildVars(lead, EVENTS, NOW));
      expect(text).toMatch(/^Selamat pagi, (Bapak|Ibu) /);
      expect(text).toContain(lead.call_name);
      expect(text).not.toMatch(/[{}[\]]|undefined|null|NaN/);
      expect(text).toContain('🙏');
    }
  });

  it('A1 Ruslan and B1 Bolon render the approved text', () => {
    const ruslan = renderTemplate('A1', TPL, buildVars(data.roadshow[14].lead, EVENTS, NOW));
    expect(ruslan).toContain('Selamat pagi, Bapak Ruslan 😊');
    expect(ruslan).toContain('memilih hari Rabu, 25 November 2026 untuk berkunjung');
    expect(ruslan).toContain('bertemu di pameran nanti 🙏');
    expect(ruslan).toContain('saya Jackson dari tim Pameran Properti Malaysia. Terima kasih sudah mendaftar untuk acara kami yaitu Medan Property Roadshow di Cambridge City Square');
    const bolon = renderTemplate('B1', TPL, buildVars(data.jesselton[3].lead, EVENTS, NOW));
    expect(bolon).toContain('🕒 15.00–17.00 WIB\n📍 Emerald 1 (Lantai 25), Cambridge Hotel Medan\n👥 1 orang');
    expect(bolon).toContain('https://jesselton-medan.pages.dev/');
  });
});
