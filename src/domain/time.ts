// All business logic uses WIB (Asia/Jakarta, UTC+7, no DST) explicitly, never server/browser time zone.
const WIB_OFFSET_MS = 7 * 3600_000;

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export interface WibParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number; date: string }

export function wib(now: Date): WibParts {
  const d = new Date(now.getTime() + WIB_OFFSET_MS);
  const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, day = d.getUTCDate();
  return {
    year, month, day, hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay(),
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Senin, 23 November 2026" from 2026-11-23. */
export function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** WIB wall-clock -> Date. */
export function fromWib(date: string, hh = 0, mm = 0): Date {
  return new Date(Date.parse(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`) - WIB_OFFSET_MS);
}

export type Salam = 'pagi' | 'siang' | 'sore' | 'malam';

/** 03.00–10.59 pagi, 11.00–14.59 siang, 15.00–17.59 sore, 18.00–02.59 malam (WIB). */
export function getSalam(now: Date): Salam {
  const h = wib(now).hour;
  if (h >= 3 && h < 11) return 'pagi';
  if (h >= 11 && h < 15) return 'siang';
  if (h >= 15 && h < 18) return 'sore';
  return 'malam';
}

/** Proactive messages are allowed 09.00–20.00 WIB. */
export function isProactiveHours(now: Date): boolean {
  const { hour, minute } = wib(now);
  return hour >= 9 && (hour < 20 || (hour === 20 && minute === 0));
}

export function hoursBetween(fromIso: string, to: Date): number {
  return (to.getTime() - Date.parse(fromIso)) / 3600_000;
}

/** "hari ini" / "kemarin" / "sebelumnya" relative to a past ISO timestamp (WIB calendar days). */
export function relativeDayWord(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'sebelumnya';
  const a = wib(new Date(iso)).date, b = wib(now).date;
  if (a === b) return 'hari ini';
  if (addDays(a, 1) === b) return 'kemarin';
  return 'sebelumnya';
}

export function dayName(date: string): string {
  return DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** "19/11 09.12" style short WIB display. */
export function shortWib(iso: string): string {
  const p = wib(new Date(iso));
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}.${String(p.minute).padStart(2, '0')}`;
}
