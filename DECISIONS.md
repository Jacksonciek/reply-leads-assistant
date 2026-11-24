# Keputusan & asumsi

## Temuan saat membaca proyek
- Repo sudah berisi kode dari versi spesifikasi lama: **WhatsApp bot** dengan Meta Cloud API, webhook, notifikasi Telegram, cron, dan auto-send. Ini melanggar Batasan Keras 1. File-file itu (`webhook.ts`, `cron.ts`, `services/whatsapp.ts`, `services/telegram.ts`, `domain/window.ts`, logika tier/auto-send) **sudah dihapus**. Fungsi domain murni (telepon, nama, judul Bitrix, kasus, template engine, guardrail) dipertahankan dan disesuaikan.
- Excel: sheet `Roadshow` berisi **17** lead, bukan 16. Lead #17 Haura Hafizhah Irawan berstatus `No WhatsApp` dan kasusnya `X`. Total lead **39** (17 + 22). Struktur kolom sama dengan Bagian 6.1.

## Template
- A1/A2 memakai pembuka baru: "tim {tim_nama} … acara kami yaitu {event_nama}".
- A-R2 lama berisi kalimat "jika … lebih nyaman tidak dihubungi lagi … saya hormati". Kalimat itu **dihapus** (Batasan Keras 11).
- Teks HOLD_DAY/HOLD_NIGHT/ACK_CONFIRM/MEDIA_HOLD lama diganti satu teks `HOLD` sesuai Bagian 10.
- `CROSS_EVENT-A` (Roadshow setelah Jesselton) memakai teks Bagian 9A dan berstatus APPROVED. Teks ini menggantikan paragraf salam dan perkenalan A1/A2.
- `CROSS_EVENT-B` (Jesselton setelah Roadshow) **kalimatnya saya susun sendiri**. Spesifikasi hanya memberi polanya. Kalimat ini menggantikan kalimat "Perkenalkan, …" di B1–B5 dan berstatus **NEW_NEEDS_REVIEW**. Selama belum disetujui, pesan memakai template biasa dengan peringatan "Terdaftar juga di …".
- `ASK_IF_BOT` adalah teks cadangan yang jujur bila draft LLM ditolak guardrail. Teks ini saya buat sendiri, berstatus **NEW_NEEDS_REVIEW**, dan selama belum disetujui cadangannya `HOLD`.
- A-H1 berstatus NEW_NEEDS_REVIEW, sesuai spesifikasi.
- `REMINDER_PA`: kata "kemarin" diganti variabel `{waktu_obrolan}` (hari ini / kemarin / sebelumnya). `{hari_kunjungan}` untuk Jesselton = "Sabtu".
- Template yang Anda ubah dari UI disimpan dengan status yang Anda pilih ("Simpan & setujui" atau "perlu ditinjau").

## Data / Sheets
- Kolom `Status` di sheet adalah sumber kebenaran state. Nilai tambahan: `Terkonfirmasi`, `Tidak hadir`, `Opt-out`.
- Kolom sistem tambahan: `call_name_ok` (nama sapaan sudah dicek), supaya tanda "perlu dicek" hilang setelah Anda konfirmasi.
- Jesselton: `Guest` menyimpan kategori (1 orang / 2 orang / 3 orang atau lebih / Kirim info saja / Unknown). Jumlah pasti ≥ 3 disimpan di `Jumlah Pasti`.
- `Phone number` ditulis ulang sebagai `wa.me/62…` (format Excel).
- Tidak ada cache data: setiap halaman membaca Sheets langsung.
- `STORE=memory` (atau `SHEET_ID` kosong) memakai penyimpanan memori untuk uji lokal. Datanya hilang saat restart.

## State & alur
- State hanya berubah karena klik Anda. Pengecualian yang mengikuti spesifikasi: menandai pesan pertama terkirim membuat NEW → AWAITING_REPLY, menempel balasan klien membuat → REPLIED, dan menandai KONF terkirim membuat → CONFIRMED (sekaligus menerapkan data sesi/jumlah/tanggal yang dipakai KONF).
- Membalas lead REPLIED tidak mengubah state kembali ke AWAITING_REPLY. Antrean "belum dibalas" dihitung dari arah pesan terakhir di room.
- Menempel pesan ke lead DECLINED/OPTED_OUT mengubah state ke REPLIED dan menampilkan peringatan (Bagian 6.5).
- Balasan "Ya"/"iya" saja **tidak** dianggap basa-basi, karena A-R1 meminta klien membalas "Ya". Balasan ini dikirim ke LLM.
- B-H1 muncul pada Jumat 27 November mulai 08.00 WIB.

## API
- Endpoint tambahan: `GET /api/bulk` (Generator Massal), `GET /api/leads/:id/render/:code` (sisip cepat), `POST /api/setup`.
- `POST /api/import/preview` dan `GET /api/export.xlsx` **tidak dibuat**. Pratinjau impor dan ekspor rekap dikerjakan di browser (SheetJS, fungsi domain yang sama). Hasilnya sama, dengan kode lebih sedikit.

## Dependensi
- `xlsx` (SheetJS, dari CDN resmi SheetJS) hanya dipakai di frontend (impor/ekspor) dan test. Tidak ada dependensi berat lain.

## Batas layanan (dicek 19 Nov 2026)
- Cloudflare Workers Free: 100.000 request/hari, **CPU 10 ms per request**, 50 subrequest per request. Penandatanganan JWT RS256 untuk Google hanya terjadi sekitar sekali per 55 menit (token di-cache di KV), jadi request biasa jauh di bawah batas CPU. Bila muncul error 1102 (CPU), pertimbangkan Workers Paid.
- Gemini: dokumentasi resmi tidak lagi mencantumkan angka kuota tier gratis untuk model Flash. Kuota dilihat di https://aistudio.google.com/rate-limit. Model diatur lewat `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` (default alias `gemini-flash-lite-latest` / `gemini-flash-latest`). **Verifikasi** dengan tombol "Uji Gemini" di Pengaturan, yang menampilkan daftar model yang tersedia untuk API key Anda. Di tier gratis, konten bisa dipakai Google untuk perbaikan produk: karena itu data dikurangi (lihat Batasan Keras 8, `src/domain/redact.ts`).
- Bila Gemini 429, draft menjadi `HOLD` dengan pesan jelas. Template dan teks tetap tetap bisa dipakai.

## Default Bagian 19
Semua default Bagian 19 dipakai tanpa perubahan dan bisa diubah di halaman Pengaturan atau di sheet `Config`.

## Perubahan 24 Nov 2026 (Dashboard, status WhatsApp, export Excel)
- Menu: Today → **Dashboard**, Bulk dihapus (halaman + `GET /api/bulk`), **Template** jadi menu utama, More → **Settings** (Adjustments, Import Excel, Knowledge).
- Kolom sistem baru per lead: `wa_status` (Belum balas / No WhatsApp / Terkonfirmasi / Balas, belum pasti / Tidak bisa hadir / Bad lead), `next_step`, `reminder_text`. Dashboard menghitung 4 status pertama per acara. Terkonfirmasi = hijau, Bad lead = merah.
- `reminder_text` hanya saran untuk disalin. Website tetap tidak pernah mengirim pesan.
- Chat WhatsApp dibaca dari WhatsApp Web (oleh Claude lewat Chrome, read-only) dan disimpan lewat `PUT /api/leads/:id/whatsapp`. Pesan aplikasi yang lebih tua dari pesan WhatsApp pertama tetap ada sebagai arsip (pesan WA hilang setelah 7 hari). Nomor yang terdaftar di dua acara memakai chat yang sama di kedua lead.
- Import (mode update) mengikuti Excel untuk semua kolomnya (Name, Gender, Phone, Email/Website-Meta, Date/Time/Guest, Status in Bitrix, Notes, No). Status aplikasi tidak diubah oleh import.
- Export memakai sheet dan kolom yang sama persis dengan file Bitrix24 (`EXCEL_COLUMNS`), urut kolom "No"; lead baru di bawah.
