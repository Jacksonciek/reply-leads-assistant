// Approved templates (Section 9) and fixed texts (Section 10). Placeholders adapted; layout uses WhatsApp
// formatting: short info lines with an emoji label, and *bold* (single asterisks) for the important parts.
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

// ---------- shared info lines ----------

const RS_LOKASI = `📍 Lokasi: Cambridge City Square, Medan
🏢 Booth: Area Concourse, Ground Floor, dekat Restoran Lebanon`;

const JC_TANGGAL = `📅 Tanggal: *Sabtu, 28 November 2026*`;
const JC_LOKASI = `📍 Lokasi: Emerald 1 (Lantai 25), Cambridge Hotel Medan`;
const JC_SESI = `🕒 Sesi: *{sesi_label} WIB* · {sesi_nama}`;
const JC_DUA_SESI = `1️⃣ 11.00–13.00 WIB · Private Talk & Luncheon
2️⃣ 15.00–17.00 WIB · Private Preview & Afternoon Tea`;
const JC_LINK = `🔗 Info proyek: {link_proyek}`;

// ---------- Roadshow ----------

const A1 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim {tim_nama}. Terima kasih sudah mendaftar untuk *{event_nama}*.

📅 Tanggal acara: 23–29 November 2026
🗓️ Pilihan kunjungan {sapaan}: *{tanggal_label}*
${RS_LOKASI}

Bila sudah ada *perkiraan jam kedatangan*, boleh dikabari agar Property Advisor kami bisa bersiap menyambut {sapaan}.
Jadwal berubah pun tidak masalah, silakan kabari kapan pun.

Terima kasih, {sapaan_pendek}, semoga berkesempatan bertemu di {event_sebutan} nanti 🙏`;

const A2 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim {tim_nama}. Terima kasih sudah mendaftar untuk *{event_nama}*.

📅 Tanggal: *23–29 November 2026*
${RS_LOKASI}

Boleh kami tahu *kira-kira hari apa {sapaan} berencana datang*? Belum pasti pun tidak apa-apa, kabari saja kapan pun.
Bila ingin informasi lebih lanjut, tim Property Advisor kami siap membantu.

Terima kasih, {sapaan_pendek}, semoga berkesempatan bertemu di {event_sebutan} nanti 🙏`;

// Reminder during the event, visit day not decided yet.
const A3 = `Selamat {salam}, {sapaan} {nama} 😊

Saya Jackson dari tim Malaysia Property Showcase. Sekadar mengingatkan, *Pameran Properti Malaysia {acara_status}*:

📅 Tanggal: *23–29 November 2026*
${RS_LOKASI}

Kami dengan senang hati menantikan kunjungan {sapaan}!
Boleh saya tahu *kira-kira hari apa dan sekitar pukul berapa* {sapaan} berencana datang? Dengan begitu, kami bisa menjadwalkan Property Advisor yang tepat untuk mendampingi {sapaan}.

Terima kasih, sampai bertemu di pameran! 😊`;

// Reminder / reconfirmation for a chosen visit day (day before or on the day).
const A4 = `Selamat {salam}, {sapaan} {nama} 😊

Saya Jackson dari tim Malaysia Property Showcase. Kami ingin mengonfirmasi kembali kunjungan {sapaan} {kunjungan_kata}:

📅 Tanggal: *{tanggal_label}*
{{#if jam_status == "ada"}}🕒 Perkiraan jam: *{jam_datang} WIB*
{{/if}}📍 Lokasi: Cambridge City Square, Medan
🏢 Booth: *Area Concourse, Ground Floor, dekat Restoran Lebanon*

{{#if jam_status == "kosong"}}Boleh saya tahu *kira-kira pukul berapa* {sapaan} berencana datang? Dengan begitu, kami bisa menyiapkan Property Advisor untuk menyambut dan mendampingi {sapaan} selama kunjungan.{{/if}}{{#if jam_status == "ada"}}Property Advisor kami akan bersiap menyambut dan mendampingi {sapaan} selama kunjungan. Bila ada perubahan, kabari saja ya.{{/if}}

Kami nantikan kehadiran {sapaan} {kunjungan_kata}. Sampai bertemu! 😊`;

const A_R1 = `Selamat {salam}, {sapaan} {nama} 😊

Mohon maaf bila pesan saya sebelumnya mengganggu waktu {sapaan}. Saya Jackson dari tim {event_nama}, sekadar mengingatkan jadwal kunjungan {sapaan}:

📅 Tanggal: *{tanggal_label}*
${RS_LOKASI}

Jika jadwal masih sesuai, cukup balas *"Ya"* saja.
Bila ada perubahan atau berhalangan, tidak apa-apa, kabari saja agar catatan kami diperbarui.

Terima kasih, {sapaan_pendek}, semoga berkesempatan bertemu di {event_sebutan} nanti 🙏`;

const A_R2 = `Selamat {salam}, {sapaan} {nama} 😊

Mohon maaf bila pesan saya sebelumnya belum sempat terbaca. Saya Jackson dari tim {event_nama}, sekadar menyapa kembali terkait acara kami:

📅 Tanggal: *23–29 November 2026*
${RS_LOKASI}

Bila {sapaan} sudah punya gambaran *hari kunjungan*, boleh kabari saya kapan saja. Belum pasti pun tidak apa-apa.

Terima kasih, {sapaan_pendek} 🙏`;

// ---------- Jesselton ----------

const B1 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih sudah mendaftar, dengan senang hati kami konfirmasikan reservasi {sapaan}:

${JC_TANGGAL}
${JC_SESI}
${JC_LOKASI}
👥 Jumlah tamu: *{jumlah_label}*
${JC_LINK}

Bila berkenan, mohon balas *"Hadir"* agar kami catat ya.
Ada perubahan jadwal atau jumlah tamu? Tidak masalah, kabari saja kapan pun.

Kami sangat menantikan kehadiran {sapaan}, sampai bertemu 🙏`;

const B2 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih sudah mendaftar, kami sudah mencatat pilihan sesi {sapaan}:

${JC_TANGGAL}
${JC_SESI}
${JC_LOKASI}
{{#if guests_variant == "3plus"}}👥 Jumlah tamu: 3 orang atau lebih
{{/if}}${JC_LINK}

{{#if guests_variant == "empty"}}Boleh kami tahu *kira-kira {sapaan} akan hadir bersama berapa orang*? Perkiraan saja sudah cukup, supaya tempat dan jamuannya bisa kami siapkan dengan nyaman.{{/if}}{{#if guests_variant == "3plus"}}Boleh dikonfirmasi *jumlah pastinya*? Perkiraan saja sudah cukup, supaya tempat dan jamuannya bisa kami siapkan dengan nyaman.{{/if}}

Kami sangat menantikan kehadiran {sapaan} 🙏`;

const B3 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih sudah mendaftar untuk acara kami:

${JC_TANGGAL}
${JC_LOKASI}
👥 Jumlah tamu: *{jumlah_label}*
${JC_LINK}

*Sesi mana yang lebih nyaman untuk {sapaan}?*
${JC_DUA_SESI}

Cukup balas *1* atau *2* ya. Kalau belum pasti, tidak apa-apa, kabari saja kapan pun.

Terima kasih, {sapaan_pendek}, kami nantikan kehadirannya 🙏`;

const B4_ASK = `Bila berkenan, *sesi mana yang lebih nyaman (1 atau 2)*, dan kira-kira bersama berapa orang? Belum pasti pun tidak apa-apa.`;
const B5_ASK = `Pendaftaran {sapaan} tercatat untuk *{jumlah_label}*. *Sesi mana yang lebih nyaman (1 atau 2)?* Belum pasti pun tidak apa-apa.`;

const B4 = `Selamat {salam}, {sapaan} {nama} 😊

Perkenalkan, saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview bersama Berjaya Properties. Terima kasih atas ketertarikan {sapaan} terhadap Jesselton Courtyard.
${JC_LINK}

Kami juga dengan senang hati mengundang {sapaan} ke *Private Property Preview*:

${JC_TANGGAL}
${JC_LOKASI}
${JC_DUA_SESI}

${B4_ASK}
Jika ingin penjelasan lebih lanjut mengenai proyeknya, saya bisa atur agar tim Property Advisor kami menghubungi {sapaan} di waktu yang nyaman.

Terima kasih, {sapaan_pendek} 🙏`;

const B5 = B4.replace(B4_ASK, B5_ASK);
if (B5 === B4) throw new Error('B5 derivation failed');

// Reminder for a lead whose session is known: tells each person their own session.
const B6 = `Selamat {salam}, {sapaan} {nama} 😊

Saya Jackson dari tim penyelenggara Jesselton Courtyard Private Property Preview. Sekadar mengingatkan *jadwal sesi {sapaan}*:

${JC_TANGGAL}
${JC_SESI}
${JC_LOKASI}
{{#if jumlah_label}}👥 Jumlah tamu: *{jumlah_label}*
{{/if}}${JC_LINK}

Jika jadwal masih sesuai, cukup balas *"Hadir"* ya.
Ada perubahan sesi atau jumlah tamu? Tidak masalah, kabari saja.

Kami nantikan kehadiran {sapaan} 🙏`;

// Reminder for a lead whose session is not known yet.
const B_R = `Selamat {salam}, {sapaan} {nama} 😊

Mohon maaf bila pesan saya sebelumnya mengganggu waktu {sapaan}. Saya Jackson dari tim Jesselton Courtyard Private Property Preview, sekadar mengingatkan acaranya:

${JC_TANGGAL}
${JC_LOKASI}
${JC_DUA_SESI}

Jika berkenan, cukup balas *"Hadir"* beserta *pilihan sesi (1 atau 2)* agar kami bisa menyiapkan tempatnya.
Bila berhalangan, tidak apa-apa, kabari saja.

Terima kasih, {sapaan_pendek} 🙏`;

const B_H1 = `Selamat {salam}, {sapaan} {nama} 😊

Sekadar mengingatkan, *Private Property Preview Jesselton Courtyard berlangsung besok*:

${JC_TANGGAL}
${JC_SESI}
${JC_LOKASI}
{{#if jumlah_label}}👥 Jumlah tamu: *{jumlah_label}*
{{/if}}
Bila ada perubahan rencana, tidak apa-apa, kabari saja.
Kami menantikan kehadiran {sapaan} 🙏`;

// ---------- replies ----------

const KONF_A = `Terima kasih, {sapaan} {nama} 😊 Kunjungan {sapaan} ke *{event_nama}* sudah kami catat:

📅 Tanggal: *{tanggal_label}*
{{#if jam_datang}}🕒 Jam: *sekitar pukul {jam_datang} WIB*
{{/if}}${RS_LOKASI}

Bila ada perubahan, tidak masalah sama sekali, kabari saja kapan pun.
Sampai bertemu di sana 🙏`;

const KONF_B = `Terima kasih, {sapaan} {nama} 😊 Reservasi {sapaan} sudah kami catat:

${JC_TANGGAL}
${JC_SESI}
${JC_LOKASI}
👥 Jumlah tamu: *{jumlah_label}*

Bila ada perubahan, tidak masalah sama sekali, kabari saja kapan pun.
Kami nantikan kehadiran {sapaan} 🙏`;

// Replaces the "Perkenalkan, ..." sentence of B1–B5. Wording derived by Claude: needs Jackson's review.
const CROSS_EVENT_B = `Terima kasih juga sudah mendaftar untuk Jesselton Courtyard Private Property Preview bersama Berjaya Properties, {sapaan_pendek}. Acara ini terpisah dari {event_lain_nama} di Cambridge City Square yang sebelumnya saya informasikan.`;

const POSTER_A = `Izin saya kirimkan poster {event_nama} ya, {sapaan_pendek}, agar lebih mudah melihat jadwal dan lokasinya 🙏`;
const POSTER_B = `Izin saya kirimkan undangan Private Property Preview Jesselton Courtyard ya, {sapaan_pendek}, untuk informasi sesi dan lokasinya 🙏`;

// ---------- Jesselton invitation (Sabtu ini), sent as: message 1 → video → message 2 ----------
const JC_LOKASI_SINGKAT = `*Cambridge Hotel Medan, Emerald 1 (Lantai 25)*`;

// Not fixed yet (Belum balas / Balas, belum pasti). Message 2 depends on what is known (jc_varian A–D).
const JC_INV_1 = `Hi {sapaan} {nama} 😊

Sabtu ini, 28 November 2026, kami mengadakan *Private Preview Jesselton Courtyard* di ${JC_LOKASI_SINGKAT}. Saya, Jackson, ingin mengundang {sapaan} secara pribadi.`;

const JC_INV_2 = `{{#if jc_varian == "A"}}Kalau berkenan hadir, lebih nyaman ikut sesi *jam 11.00 siang* atau *jam 15.00 sore*? Dan kira-kira datang bersama berapa orang?{{/if}}{{#if jc_varian == "B"}}Kami sudah catat {sapaan} untuk *sesi jam {sesi_jam}*. Kira-kira datang bersama berapa orang?{{/if}}{{#if jc_varian == "C"}}Kami sudah catat {sapaan} untuk *{jumlah_label}*. Kalau berkenan hadir, lebih nyaman ikut sesi *jam 11.00 siang* atau *jam 15.00 sore*?{{/if}}{{#if jc_varian == "C3"}}Kami sudah catat {sapaan} untuk *{jumlah_label}*. Boleh tahu jumlah pastinya? Kalau berkenan hadir, lebih nyaman ikut sesi *jam 11.00 siang* atau *jam 15.00 sore*?{{/if}}{{#if jc_varian == "D"}}Kami sudah catat {sapaan} untuk *sesi jam {sesi_jam}* bersama *{jumlah_label}*. Mohon dibalas *"Hadir"* bila jadwalnya masih sesuai ya.{{/if}}{{#if jc_varian == "D3"}}Kami sudah catat {sapaan} untuk *sesi jam {sesi_jam}* bersama *{jumlah_label}*. Boleh tahu jumlah pastinya? Mohon dibalas *"Hadir"* bila jadwalnya masih sesuai ya.{{/if}} Terima kasih {sapaan_pendek}! 🙏🏻`;

// Fixed (Terkonfirmasi).
const JC_FIX_1 = `Hi {sapaan} {nama} 😊

Saya Jackson, ingin mengingatkan bahwa Sabtu ini, 28 November 2026, kita ada *Private Preview Jesselton Courtyard* di ${JC_LOKASI_SINGKAT}. Kami sudah catat {sapaan} untuk *sesi jam {sesi_jam} WIB*{{#if jumlah_label}} bersama *{jumlah_label}*{{/if}}.

Saya kirim video singkatnya ya.`;

const JC_FIX_2 = `Semoga bisa bertemu Sabtu nanti ya, terima kasih {sapaan_pendek}! 🙏🏻`;

const T = (code: string, event: TemplateDef['event'], kind: TemplateKind, body: string, description: string, status: TemplateStatus = 'APPROVED'): TemplateDef =>
  ({ code, event, kind, body, status, description });

export const DEFAULT_TEMPLATES: TemplateDef[] = [
  T('A1', 'ROADSHOW', 'PROACTIVE', A1, 'Pesan pertama, tanggal sudah dipilih'),
  T('A2', 'ROADSHOW', 'PROACTIVE', A2, 'Pesan pertama, tanggal belum pasti'),
  T('A3', 'ROADSHOW', 'PROACTIVE', A3, 'Reminder saat pameran, hari kunjungan belum pasti'),
  T('A4', 'ROADSHOW', 'PROACTIVE', A4, 'Reminder konfirmasi kunjungan (H-1 atau hari-H)'),
  T('A-R1', 'ROADSHOW', 'PROACTIVE', A_R1, 'Reminder, tanggal ada'),
  T('A-R2', 'ROADSHOW', 'PROACTIVE', A_R2, 'Reminder, tanggal belum pasti'),
  T('B1', 'JESSELTON', 'PROACTIVE', B1, 'Pesan pertama, sesi + 1–2 tamu'),
  T('B2', 'JESSELTON', 'PROACTIVE', B2, 'Pesan pertama, sesi ada, tamu kosong / 3+'),
  T('B3', 'JESSELTON', 'PROACTIVE', B3, 'Pesan pertama, tamu ada, sesi belum'),
  T('B4', 'JESSELTON', 'PROACTIVE', B4, 'Pesan pertama, hanya minta info'),
  T('B5', 'JESSELTON', 'PROACTIVE', B5, 'Pesan pertama, info saja + tamu ada'),
  T('B6', 'JESSELTON', 'PROACTIVE', B6, 'Reminder sesi masing-masing (sesi sudah diketahui)'),
  T('B-R', 'JESSELTON', 'PROACTIVE', B_R, 'Reminder, sesi belum diketahui'),
  T('B-H1', 'JESSELTON', 'PROACTIVE', B_H1, 'Pengingat H-1 (Jumat 27 Nov)'),
  T('JC-INV-1', 'JESSELTON', 'PROACTIVE', JC_INV_1, 'Undangan Sabtu, belum fix — pesan 1 (lalu kirim video)'),
  T('JC-INV-2', 'JESSELTON', 'PROACTIVE', JC_INV_2, 'Undangan Sabtu, belum fix — pesan 2 (A: jam & orang belum, B: jam ada, C: orang ada, D: keduanya ada; C3/D3: 3 orang atau lebih)'),
  T('JC-FIX-1', 'JESSELTON', 'PROACTIVE', JC_FIX_1, 'Pengingat Sabtu, sudah fix — pesan 1 (lalu kirim video)'),
  T('JC-FIX-2', 'JESSELTON', 'PROACTIVE', JC_FIX_2, 'Pengingat Sabtu, sudah fix — pesan 2'),
  T('KONF-A', 'ROADSHOW', 'REPLY', KONF_A, 'Konfirmasi final Roadshow'),
  T('KONF-B', 'JESSELTON', 'REPLY', KONF_B, 'Konfirmasi final Jesselton'),
  T('CROSS_EVENT-B', 'JESSELTON', 'PROACTIVE', CROSS_EVENT_B, 'Kalimat pembuka B1–B5 bila nomor sudah dihubungi untuk Roadshow', 'NEW_NEEDS_REVIEW'),
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
  'tanggal_label', 'jam_datang', 'jam_status', 'sesi_label', 'sesi_nama', 'jumlah', 'jumlah_label', 'link_proyek',
  'guests_variant', 'sumber_pendaftaran', 'hari_kunjungan', 'waktu_obrolan', 'acara_status', 'kunjungan_kata',
  'sesi_jam', 'jc_varian',
] as const;
