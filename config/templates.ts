// Approved templates (Section 9) and fixed texts (Section 10). Copied verbatim; only placeholders adapted.
// Default values are seeded into the `Templates` sheet; the sheet version wins at runtime.

import type { EventCode } from './events';

export type TemplateStatus = 'APPROVED' | 'NEW_NEEDS_REVIEW';
export type TemplateKind = 'PROACTIVE' | 'REPLY' | 'FIXED';

export interface TemplateDef {
  code: string;
  event: EventCode | 'ALL';
  kind: TemplateKind;
  body: string;
  status: TemplateStatus;
  description: string;
}

const A1 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim {tim_nama}. Terima kasih sudah mendaftar untuk acara kami yaitu {event_nama} di Cambridge City Square, Medan, tanggal 23–29 November 2026.

Kami mencatat {sapaan} memilih hari {tanggal_label} untuk berkunjung. Jika jadwal tersebut berubah, tidak masalah sama sekali, silakan kabari kapan pun. Bila sudah ada perkiraan jam kedatangan, boleh disampaikan agar kunjungannya bisa kami atur dengan nyaman.

Jika sewaktu-waktu {sapaan} ingin mengetahui informasi lebih lanjut, tim Property Advisor kami siap membantu.

Terima kasih, {sapaan_pendek}, dan semoga berkesempatan bertemu di {event_sebutan} nanti 🙏`;

const A2 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim {tim_nama}. Terima kasih sudah mendaftar untuk acara kami yaitu {event_nama} di Cambridge City Square, Medan, tanggal 23–29 November 2026.

Bila {sapaan} sudah memiliki gambaran kapan kira-kira dapat berkunjung, boleh kami ketahui agar waktunya bisa kami atur dengan nyaman. Namun jika belum, tidak apa-apa. Silakan kabari saya kapan saja ketika rencananya sudah ada.

Jika {sapaan} ingin mengetahui informasi lebih lanjut, tim Property Advisor kami siap membantu kapan pun diperlukan.

Terima kasih, {sapaan_pendek}, dan semoga berkesempatan bertemu di {event_sebutan} nanti 🙏`;

const A3 = `Selamat {salam}, {sapaan} {nama} 😊

Tidak apa-apa, {sapaan_pendek}, dengan senang hati saya informasikan kembali ya. Sebelumnya {sapaan} mendaftar untuk {event_nama} di Cambridge City Square, Medan (Lantai G, depan Lebanon), tanggal 23–29 November 2026.

Di acara ini, {sapaan} berkesempatan mengenal berbagai pilihan properti di Malaysia. E-invitation-nya saya lampirkan di bawah ya.

Bila ada hal yang ingin ditanyakan, silakan kabari saya. Nanti saya bantu teruskan ke tim Property Advisor kami. Semoga bisa bertemu di acara nanti 🙏`;

const A4 = `Baik, {sapaan} {nama} 😊 Dengan senang hati.

Berikut saya kirimkan e-invitation {event_nama}. Acaranya berlangsung 23–29 November 2026 di Cambridge City Square, Medan (Lantai G, depan Lebanon), dan {sapaan} bisa memilih hari yang paling nyaman di antara tanggal tersebut.

Jika ada yang ingin ditanyakan, silakan kabari saya. Nanti saya bantu teruskan ke tim Property Advisor kami.

Terima kasih, {sapaan_pendek}, semoga kita bisa bertemu di sana 🙏`;

const A_R1 = `Selamat {salam}, {sapaan} {nama} 😊

Mohon maaf bila pesan saya sebelumnya mengganggu waktu {sapaan}. Saya Jackson dari tim {event_nama}, sekadar mengingatkan bahwa {sapaan} terdaftar untuk berkunjung pada {tanggal_label} di Cambridge City Square, Medan.

Jika jadwal tersebut masih sesuai, cukup balas "Ya" saja. Bila ada perubahan atau berhalangan, tidak apa-apa, kabari saja agar catatan kami diperbarui.

Terima kasih, {sapaan_pendek}, semoga berkesempatan bertemu di {event_sebutan} nanti 🙏`;

const A_R2 = `Selamat {salam}, {sapaan} {nama} 😊

Mohon maaf bila pesan saya sebelumnya belum sempat terbaca. Saya Jackson dari tim {event_nama}, sekadar menyapa kembali terkait acara kami di Cambridge City Square, Medan, 23–29 November 2026.

Bila {sapaan} sudah punya gambaran hari kunjungan, boleh kabari saya kapan saja. Belum pasti pun tidak apa-apa.

Terima kasih, {sapaan_pendek} 🙏`;

const A_H1 = `Selamat {salam}, {sapaan} {nama} 😊

Sekadar mengingatkan, besok {tanggal_label} {sapaan} berencana berkunjung ke {event_nama} di Cambridge City Square, Medan (Lantai G, depan Lebanon).

Bila ada perubahan rencana, tidak apa-apa, kabari saja. Sampai bertemu besok 🙏`;

const B1 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih sudah mendaftar, dengan senang hati kami konfirmasikan reservasi {sapaan}:

📅 Sabtu, 28 November 2026
🕒 {sesi_label} WIB
📍 Emerald 1 (Lantai 25), Cambridge Hotel Medan
👥 {jumlah_label}

Bila ada perubahan jadwal atau jumlah tamu, tidak masalah sama sekali, silakan kabari kapan pun. Bila berkenan, mohon balas "Hadir" agar kami catat ya.

Informasi proyek: {link_proyek}

Kami sangat menantikan kehadiran {sapaan}, sampai bertemu 🙏`;

const B2 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih sudah mendaftar, kami sudah mencatat pilihan sesi {sapaan}:

📅 Sabtu, 28 November 2026
🕒 {sesi_label} WIB
📍 Emerald 1 (Lantai 25), Cambridge Hotel Medan

{{#if guests_variant == "empty"}}Boleh kami tahu kira-kira {sapaan} akan hadir bersama berapa orang? Perkiraan saja sudah cukup, supaya tempat dan jamuannya bisa kami siapkan dengan nyaman.{{/if}}{{#if guests_variant == "3plus"}}Kami mencatat {sapaan} mendaftar untuk 3 orang atau lebih. Boleh dikonfirmasi jumlah pastinya? Perkiraan saja sudah cukup, supaya tempat dan jamuannya bisa kami siapkan dengan nyaman.{{/if}}

Informasi proyek: {link_proyek}

Kami sangat menantikan kehadiran {sapaan} 🙏`;

const B3 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih sudah mendaftar untuk acara kami pada Sabtu, 28 November 2026 di Cambridge Hotel Medan (Emerald 1, Lantai 25). Pendaftaran {sapaan} sudah kami catat untuk {jumlah_label}.

Sesi mana yang lebih nyaman untuk {sapaan}?
🕚 11.00–13.00 WIB · Private Talk & Luncheon
🕒 15.00–17.00 WIB · Private Preview & Afternoon Tea

Cukup balas 1 atau 2 ya. Kalau belum pasti, tidak apa-apa, kabari saja kapan pun.

Informasi proyek: {link_proyek}

Terima kasih, {sapaan_pendek}, kami nantikan kehadirannya 🙏`;

const B4_ASK = `Bila berkenan, sesi mana yang lebih nyaman, dan kira-kira bersama berapa orang? Belum pasti pun tidak apa-apa.`;
const B5_ASK = `Pendaftaran {sapaan} sudah kami catat untuk {jumlah_label}. Sesi mana yang lebih nyaman? Belum pasti pun tidak apa-apa.`;

const B4 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih atas ketertarikan {sapaan} terhadap Jesselton Courtyard. Informasi awalnya bisa dilihat di sini:
{link_proyek}

Kami juga dengan senang hati mengundang {sapaan} ke Private Property Preview, Sabtu, 28 November 2026, di Cambridge Hotel Medan (Emerald 1, Lantai 25):
🕚 11.00–13.00 WIB · Private Talk & Luncheon
🕒 15.00–17.00 WIB · Private Preview & Afternoon Tea

${B4_ASK}

Jika {sapaan} ingin penjelasan lebih lanjut mengenai proyeknya, saya bisa atur agar tim Property Advisor kami menghubungi {sapaan} di waktu yang nyaman.

Terima kasih, {sapaan_pendek} 🙏`;

const B5 = B4.replace(B4_ASK, B5_ASK);
if (B5 === B4) throw new Error('B5 derivation failed');

const B_R = `Selamat {salam}, {sapaan} {nama} 😊

Mohon maaf bila pesan saya sebelumnya mengganggu waktu {sapaan}. Saya Jackson dari tim Jesselton Courtyard Private Property Preview, sekadar mengingatkan bahwa acaranya berlangsung Sabtu, 28 November 2026 di Cambridge Hotel Medan (Emerald 1, Lantai 25).

Jika berkenan, cukup balas "Hadir" beserta pilihan sesi (11.00 atau 15.00) agar kami bisa menyiapkan tempatnya. Bila berhalangan, tidak apa-apa, kabari saja.

Terima kasih, {sapaan_pendek} 🙏`;

const B_H1 = `Selamat {salam}, {sapaan} {nama} 😊

Sekadar mengingatkan, Private Property Preview Jesselton Courtyard berlangsung besok:
📅 Sabtu, 28 November 2026
🕒 {sesi_label} WIB
📍 Emerald 1 (Lantai 25), Cambridge Hotel Medan

Bila ada perubahan rencana, tidak apa-apa, kabari saja. Kami menantikan kehadiran {sapaan} 🙏`;

const KONF_A = `Terima kasih, {sapaan} {nama} 😊

Kunjungan {sapaan} ke {event_nama} sudah kami catat pada {tanggal_label}{{#if jam_datang}}, sekitar pukul {jam_datang} WIB{{/if}}, di Cambridge City Square, Medan (Lantai G, depan Lebanon).

Bila ada perubahan, tidak masalah sama sekali, kabari saja kapan pun. Sampai bertemu di sana 🙏`;

const KONF_B = `Terima kasih, {sapaan} {nama} 😊 Reservasi {sapaan} sudah kami catat:

📅 Sabtu, 28 November 2026
🕒 {sesi_label} WIB · {sesi_nama}
📍 Emerald 1 (Lantai 25), Cambridge Hotel Medan
👥 {jumlah_label}

Bila ada perubahan, tidak masalah sama sekali, kabari saja kapan pun. Kami nantikan kehadiran {sapaan} 🙏`;

const SOFT_CONFIRM_A = `Sama-sama, {sapaan_pendek} {nama} 😊 Sekadar memastikan, apakah {sapaan} berkenan berkunjung ke {event_nama} pada {tanggal_label}? Cukup balas "Ya" bila sudah pasti. Bila belum pasti, tidak apa-apa, kabari saja nanti 🙏`;

const SOFT_CONFIRM_B = `Sama-sama, {sapaan_pendek} {nama} 😊 Sekadar memastikan, apakah {sapaan} berkenan hadir di sesi {sesi_label} WIB, Sabtu, 28 November 2026? Cukup balas "Hadir" bila sudah pasti. Bila belum pasti, tidak apa-apa, kabari saja nanti 🙏`;

// Replaces the first two paragraphs (greeting + introduction) of A1/A2.
const CROSS_EVENT_A = `Selamat {salam}, {sapaan} {nama} 😊

Terima kasih juga sudah mendaftar untuk {event_nama}, {sapaan_pendek}. Acara ini terpisah dari Private Property Preview Jesselton Courtyard yang sebelumnya saya informasikan. {event_nama} berlangsung di Cambridge City Square, Medan, tanggal 23–29 November 2026.`;

// Replaces the "Perkenalkan, ..." sentence of B1–B5. Wording derived by Claude: needs Jackson's review.
const CROSS_EVENT_B = `Terima kasih juga sudah mendaftar untuk Jesselton Courtyard Private Property Preview bersama Berjaya Properties, {sapaan_pendek}. Acara ini terpisah dari {event_lain_nama} di Cambridge City Square yang sebelumnya saya informasikan.`;

const REMINDER_PA_A = `Selamat {salam}, {sapaan} {nama} 😊

Terima kasih atas obrolannya {waktu_obrolan}, {sapaan_pendek}. Sekadar mengingatkan, {sapaan} terdaftar untuk berkunjung ke {event_nama} pada {tanggal_label} di Cambridge City Square, Medan (Lantai G, depan Lebanon).

Bila ada hal yang ingin {sapaan} tanyakan lebih lanjut, saya bisa aturkan agar rekan kami dari tim Property Advisor menghubungi {sapaan}. Apakah {sapaan} berkenan, dan kira-kira kapan waktu yang paling nyaman?

Terima kasih, {sapaan_pendek}, sampai bertemu {hari_kunjungan} nanti 🙏`;

const REMINDER_PA_B = `Selamat {salam}, {sapaan} {nama} 😊

Terima kasih atas obrolannya {waktu_obrolan}, {sapaan_pendek}. Sekadar mengingatkan, {sapaan} terdaftar untuk Private Property Preview Jesselton Courtyard, Sabtu, 28 November 2026, sesi {sesi_label} WIB, di Cambridge Hotel Medan (Emerald 1, Lantai 25).

Bila ada hal yang ingin {sapaan} tanyakan lebih lanjut, saya bisa aturkan agar rekan kami dari tim Property Advisor menghubungi {sapaan}. Apakah {sapaan} berkenan, dan kira-kira kapan waktu yang paling nyaman?

Terima kasih, {sapaan_pendek}, sampai bertemu {hari_kunjungan} nanti 🙏`;

const POSTER_A = `Izin saya kirimkan poster {event_nama} ya, {sapaan_pendek}, agar lebih mudah melihat jadwal dan lokasinya 🙏`;
const POSTER_B = `Izin saya kirimkan undangan Private Property Preview Jesselton Courtyard ya, {sapaan_pendek}, untuk informasi sesi dan lokasinya 🙏`;

const T = (code: string, event: TemplateDef['event'], kind: TemplateKind, body: string, description: string, status: TemplateStatus = 'APPROVED'): TemplateDef =>
  ({ code, event, kind, body, status, description });

export const DEFAULT_TEMPLATES: TemplateDef[] = [
  T('A1', 'ROADSHOW', 'PROACTIVE', A1, 'Pesan pertama, tanggal sudah dipilih'),
  T('A2', 'ROADSHOW', 'PROACTIVE', A2, 'Pesan pertama, tanggal belum pasti'),
  T('A3', 'ROADSHOW', 'REPLY', A3, 'Klien lupa / minta diingatkan (lampirkan poster)'),
  T('A4', 'ROADSHOW', 'REPLY', A4, 'Klien minta dikirimi info (lampirkan poster)'),
  T('A-R1', 'ROADSHOW', 'PROACTIVE', A_R1, 'Reminder, tanggal ada'),
  T('A-R2', 'ROADSHOW', 'PROACTIVE', A_R2, 'Reminder, tanggal belum pasti'),
  T('A-H1', 'ROADSHOW', 'PROACTIVE', A_H1, 'Pengingat H-1', 'NEW_NEEDS_REVIEW'),
  T('B1', 'JESSELTON', 'PROACTIVE', B1, 'Pesan pertama, sesi + 1–2 tamu'),
  T('B2', 'JESSELTON', 'PROACTIVE', B2, 'Pesan pertama, sesi ada, tamu kosong / 3+'),
  T('B3', 'JESSELTON', 'PROACTIVE', B3, 'Pesan pertama, tamu ada, sesi belum'),
  T('B4', 'JESSELTON', 'PROACTIVE', B4, 'Pesan pertama, hanya minta info'),
  T('B5', 'JESSELTON', 'PROACTIVE', B5, 'Pesan pertama, info saja + tamu ada'),
  T('B-R', 'JESSELTON', 'PROACTIVE', B_R, 'Reminder'),
  T('B-H1', 'JESSELTON', 'PROACTIVE', B_H1, 'Pengingat H-1 (Jumat 27 Nov)'),
  T('KONF-A', 'ROADSHOW', 'REPLY', KONF_A, 'Konfirmasi final Roadshow'),
  T('KONF-B', 'JESSELTON', 'REPLY', KONF_B, 'Konfirmasi final Jesselton'),
  T('SOFT_CONFIRM-A', 'ROADSHOW', 'REPLY', SOFT_CONFIRM_A, 'Balasan pendek ("ok, terima kasih") sebelum terkonfirmasi'),
  T('SOFT_CONFIRM-B', 'JESSELTON', 'REPLY', SOFT_CONFIRM_B, 'Balasan pendek ("ok, terima kasih") sebelum terkonfirmasi'),
  T('CROSS_EVENT-A', 'ROADSHOW', 'PROACTIVE', CROSS_EVENT_A, 'Pembuka A1/A2 bila nomor sudah dihubungi untuk Jesselton'),
  T('CROSS_EVENT-B', 'JESSELTON', 'PROACTIVE', CROSS_EVENT_B, 'Kalimat pembuka B1–B5 bila nomor sudah dihubungi untuk Roadshow', 'NEW_NEEDS_REVIEW'),
  T('REMINDER_PA-A', 'ROADSHOW', 'REPLY', REMINDER_PA_A, 'Pengingat + tawaran Property Advisor (lead sudah membalas)'),
  T('REMINDER_PA-B', 'JESSELTON', 'REPLY', REMINDER_PA_B, 'Pengingat + tawaran Property Advisor (lead sudah membalas)'),
  T('POSTER-A', 'ROADSHOW', 'REPLY', POSTER_A, 'Caption saat mengirim poster'),
  T('POSTER-B', 'JESSELTON', 'REPLY', POSTER_B, 'Caption saat mengirim undangan'),
  T('HANDOFF_PA', 'ALL', 'FIXED', 'Terima kasih atas pertanyaannya, {sapaan} {nama} 😊 Untuk hal ini, penjelasan terbaik datang dari tim Property Advisor kami, jadi pertanyaan {sapaan} saya teruskan kepada mereka. Kira-kira kapan waktu yang paling nyaman untuk dihubungi? Di acara nanti, {sapaan} juga bisa berdiskusi langsung dengan mereka 🙏', 'Pertanyaan produk (harga, unit, dll.)'),
  T('CALL_REQUEST', 'ALL', 'FIXED', 'Baik, {sapaan} {nama} 😊 Saya aturkan agar tim Property Advisor kami menghubungi {sapaan}. Kira-kira waktu yang paling nyaman kapan? 🙏', 'Klien minta ditelepon'),
  T('PA_TIME_ACK', 'ALL', 'FIXED', 'Baik, {sapaan_pendek}, terima kasih. Sudah saya teruskan ke tim Property Advisor kami 🙏', 'Klien menyebut waktu untuk dihubungi PA'),
  T('HOLD', 'ALL', 'FIXED', 'Terima kasih, {sapaan_pendek} {nama} 😊 Pesannya sudah saya terima. Saya pastikan dulu dan segera kabari kembali ya 🙏', 'Jawaban belum ada di knowledge base'),
  T('SOURCE', 'ALL', 'FIXED', 'Mohon maaf atas ketidaknyamanannya, {sapaan} {nama}. Nomor {sapaan} kami terima dari {sumber_pendaftaran}. Bila {sapaan} tidak berkenan, kami tidak akan menghubungi {sapaan} lagi 🙏', '"Dari mana nomor saya?"'),
  T('DECLINE', 'ALL', 'FIXED', 'Baik, {sapaan_pendek}, terima kasih sudah mengabari. Semoga di lain kesempatan kita bisa bertemu 🙏', 'Klien tidak bisa hadir / tidak tertarik'),
  T('OPT_OUT', 'ALL', 'FIXED', 'Baik, {sapaan_pendek}, mohon maaf atas ketidaknyamanannya. Kami tidak akan menghubungi {sapaan} lagi. Terima kasih 🙏', 'Klien minta berhenti dihubungi'),
  // Not in the spec: honest fallback for "ini bot?" when the LLM draft is rejected. Needs review.
  T('ASK_IF_BOT', 'ALL', 'FIXED', 'Terima kasih atas pertanyaannya, {sapaan} {nama} 😊 Pesan ini saya siapkan dengan bantuan sistem, dan saya sendiri yang memantau serta memeriksa setiap balasan. Bila ada yang ingin ditanyakan tentang acara, silakan kabari saya 🙏', 'Jawaban jujur "ini bot?"', 'NEW_NEEDS_REVIEW'),
];

/** Fixed texts allowed to contain the "not contacting you again" phrase (Hard constraint 11). */
export const OPT_OUT_PHRASE_ALLOWED = ['OPT_OUT', 'SOURCE'];

export const TEMPLATE_VARS = [
  'salam', 'sapaan', 'sapaan_pendek', 'nama', 'tim_nama', 'event_nama', 'event_sebutan', 'event_lain_nama',
  'tanggal_label', 'jam_datang', 'sesi_label', 'sesi_nama', 'jumlah', 'jumlah_label', 'link_proyek',
  'guests_variant', 'sumber_pendaftaran', 'hari_kunjungan', 'waktu_obrolan',
] as const;
