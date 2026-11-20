import { describe, expect, it } from 'vitest';
import { parseWaPaste } from '../src/domain/parse-wa-paste';

const EXPORT = `Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
[11/19/26, 9:24:36 AM] - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
[11/19/26, 9:26:09 AM] You: <image omitted> Selamat pagi, Bapak Welly 😊

Terima kasih, Pak 🙏
[11/19/26, 11:15:21 AM] Welly Nico Citra | Jesselton Courtyard - Web | TBC: Selain sabtu dan minggu apa bisa?`;

describe('iPhone chat export', () => {
  it('reads You as me, US dates, skips the encryption notice, marks photos', () => {
    const m = parseWaPaste(EXPORT, 'Jackson');
    expect(m).toHaveLength(2);
    expect(m[0].direction).toBe('OUT');
    expect(m[0].text.startsWith('[Foto] Selamat pagi')).toBe(true);
    expect(m[0].text).toContain('Terima kasih, Pak');
    expect(m[0].sent_at).toBe('2026-11-19T02:26:00.000Z');
    expect(m[1].direction).toBe('IN');
    expect(m[1].text).toBe('Selain sabtu dan minggu apa bisa?');
  });
});

describe('chat written as "Name: text" without timestamps', () => {
  const CHAT = `Pak Partahi: Maaf, sy lupa kpn ya sy daftar?
Saya: Tidak apa-apa, Pak. 😊

Informasi proyek: https://jesselton-medan.pages.dev/

Terima kasih, Pak. 🙏
Pak Partahi: Oke
Saya: Baik, Pak 🙏`;
  it('splits by speaker and keeps colons inside messages', () => {
    const m = parseWaPaste(CHAT, 'Jackson');
    expect(m.map((x) => x.direction)).toEqual(['IN', 'OUT', 'IN', 'OUT']);
    expect(m[1].text).toContain('Informasi proyek: https://jesselton-medan.pages.dev/');
    expect(m[2].text).toBe('Oke');
    expect(m.every((x) => x.sent_at === null)).toBe(true);
  });
  it('a single client line with a colon stays one client message', () => {
    expect(parseWaPaste('Info: berapa harganya?')).toEqual([{ direction: 'IN', text: 'Info: berapa harganya?', sent_at: null, sender: '' }]);
  });
});
