# RUNBOOK: Generator Balasan WhatsApp

Website pribadi untuk menyusun pesan konfirmasi kehadiran **Medan Property Roadshow** dan **Jesselton Courtyard Private Property Preview**. Website **tidak** terhubung ke WhatsApp: semua pesan Anda kirim sendiri dari WhatsApp Business.

## 1. Prasyarat
- Node.js **20 atau lebih baru** (`node -v`).
- Akun Cloudflare (gratis).
- Akun Google (untuk Google Sheets, Google Cloud, dan Google AI Studio).

## 2. Menjalankan lokal
```powershell
npm install
```
```powershell
Copy-Item .dev.vars.example .dev.vars
```
Buka `.dev.vars`, lalu isi `ADMIN_PASSWORD`, `SESSION_SECRET` (string acak panjang), dan nilai Google/Gemini (langkah 3–4).
Untuk mencoba tanpa Google Sheets, tulis `STORE=memory` (data hilang saat server dimatikan).
```powershell
npm run setup:sheet
```
```powershell
npm run dev
```
Buka http://localhost:5173 — untuk sementara aplikasi langsung terbuka tanpa password (`REQUIRE_PASSWORD=false`). Untuk mengaktifkan login lagi, ubah `REQUIRE_PASSWORD` menjadi `"true"` di `wrangler.jsonc` lalu login dengan `ADMIN_PASSWORD`.
**Impor Excel:** menu Lainnya → Impor Excel → pilih `data/Roadshow__Jesselton.xlsx` → periksa pratinjau → Simpan ke Google Sheets.

## 3. Google Sheets
1. Buka https://console.cloud.google.com, buat project baru (mis. "generator-balasan").
2. Menu **APIs & Services → Library**, cari **Google Sheets API**, lalu klik **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**. Beri nama, lalu klik selesai (tidak perlu role).
4. Buka service account itu → tab **Keys → Add key → Create new key → JSON**. File JSON terunduh. **Jangan** taruh file ini di repo.
5. Dari file JSON:
   - `client_email` → `GOOGLE_SA_EMAIL`
   - `private_key` → `GOOGLE_SA_PRIVATE_KEY` (salin utuh beserta `\n`, dalam tanda kutip ganda)
6. Buat Google Sheet baru. Klik **Share**, tambahkan `client_email` sebagai **Editor**. Jangan bagikan ke orang lain.
7. `SHEET_ID` adalah bagian URL di antara `/d/` dan `/edit`.
8. Jalankan `npm run setup:sheet` (atau tombol "Jalankan setup" di Pengaturan). Perintah ini membuat tab `Roadshow`, `Jesselton`, `Messages`, `Drafts`, `FAQ`, `Templates`, `Config`, dropdown Status/Date/Time/Guest, dan kolom sistem abu-abu yang disembunyikan.

Anda boleh mengedit kolom yang terlihat langsung di Sheets (nama, status, tanggal, sesi, jumlah tamu, nama sapaan). Baris baru tanpa `lead_id` otomatis diberi ID saat website membaca. **Jangan edit kolom sistem abu-abu.**

## 4. Gemini
1. Buka https://aistudio.google.com → **Get API key → Create API key** → isi ke `GEMINI_API_KEY`.
2. Model diatur lewat `GEMINI_MODEL` dan `GEMINI_FALLBACK_MODEL` (di `wrangler.jsonc` → `vars`). Setelah website berjalan, buka **Pengaturan → Uji Gemini**. Halaman ini menampilkan model yang tersedia untuk key Anda. Pilih model Flash-Lite/Flash terbaru yang tersedia di tier gratis.
3. **Catatan privasi:** di tier gratis, Google dapat memakai konten untuk perbaikan produk. Karena itu website hanya mengirim sapaan, nama panggilan, data kehadiran, maksimal 20 pesan terakhir (nomor telepon dan email disamarkan), dan knowledge base. Nomor HP, email, nama lengkap, dan nama agen tidak pernah dikirim.
4. Kuota terlihat di https://aistudio.google.com/rate-limit. Bila kuota habis, website menampilkan pesan dan Anda tetap bisa memakai template serta teks tetap.

## 5. Deploy ke Cloudflare
```powershell
npx wrangler login
```
```powershell
npx wrangler kv namespace create KV
```
Salin `id` hasilnya ke `wrangler.jsonc` (ganti `REPLACE_WITH_KV_NAMESPACE_ID`). Isi `SHEET_ID` di `vars`.
Simpan setiap secret (perintah akan meminta nilainya):
```powershell
npx wrangler secret put ADMIN_PASSWORD
```
```powershell
npx wrangler secret put SESSION_SECRET
```
```powershell
npx wrangler secret put GOOGLE_SA_EMAIL
```
```powershell
npx wrangler secret put GOOGLE_SA_PRIVATE_KEY
```
```powershell
npx wrangler secret put GEMINI_API_KEY
```
```powershell
npm run deploy
```
URL-nya tercetak di akhir, mis. `https://zeon-reply-generator.<akun>.workers.dev`. Simpan ke layar utama HP.
**Rollback:** `npx wrangler deployments list`, lalu `npx wrangler rollback <version-id>`.
Opsional: tambahkan **Cloudflare Access** (Zero Trust → Access → Applications) untuk login kedua dengan email Anda.

## 6. Cara pakai harian
- **Lead baru dari Bitrix:** tombol **+ Lead Baru** → tempel judul lead (contoh `Bolon Parson | Jesselton Courtyard - Meta | 28/11`) → form terisi otomatis → lengkapi gender/nomor → pilih **Status saat ini** → Simpan. Room langsung terbuka dengan pesan yang disarankan.
- **Kirim pesan pertama:** di room atau **Massal → Pesan pertama**, periksa teksnya → **Buka WhatsApp** (teks sudah terisi) → tekan Kirim di WhatsApp → kembali ke website → **Ya, sudah terkirim**. Status di Sheets menjadi "Belum balas". Di luar 09.00–20.00 WIB muncul peringatan.
- **Menempel balasan klien:**
  - Android: tekan lama pesan klien → (pilih beberapa) → ikon salin.
  - iPhone: tekan lama pesan → Salin.
  - Tempel di kotak **Tempel balasan klien** → **Pratinjau** (periksa Klien/Saya, ketuk label untuk menukar) → **Simpan & buat draft**.
- **Draft:** baca intent dan alasan di atas draft, edit bila perlu. **Buat ulang** bisa diberi instruksi ("lebih singkat"). **Sisip cepat** untuk teks tetap/template. Bila ada saran (mis. "Tidak hadir", sesi/jumlah), klik **Terapkan**. Status tidak pernah berubah tanpa klik Anda.
- **Tambah pesan saya:** untuk pesan yang Anda ketik langsung di WhatsApp.
- **Poster:** untuk A3/A4 dan caption poster, unduh poster, kirim gambarnya dengan teks sebagai caption.
- **FAQ:** Lainnya → Pengetahuan. Hanya FAQ yang **Disetujui** yang dipakai AI.
- **Rekap untuk atasan:** Lead → **Ekspor .xlsx**.

## 7. Uji coba
```powershell
npm test
```
```powershell
npm run eval
```
`npm run eval` memakai Gemini asli dan 46 contoh sintetis, termasuk 9 percakapan multi-giliran. Laporannya ada di `eval-report.md`. Target: akurasi ≥ 85%, ASK_PRODUCT/REQUEST_CALL/DECLINE/OPT_OUT 100%, dan nol draft yang lolos guardrail berisi harga atau telepon.

Checklist manual di HP Android (WhatsApp + WhatsApp Business):
1. Pengaturan → format link "Android: langsung WhatsApp Business".
2. Buat lead dengan **nomor Anda sendiri** → Buka WhatsApp → cek salam sesuai jam, sapaan, nama, emoji, dan baris baru utuh → kirim → Ya, sudah terkirim → pesan muncul di room.
3. Dari nomor lain, balas "Ok, terimakasih" → salin → tempel → draft harus SOFT_CONFIRM, **bukan** "kami catat kehadiran".
4. Balas "berapa harganya?" → draft HANDOFF_PA. Balas "STOP" → draft OPT_OUT → Terapkan → lead hilang dari antrean.
5. Setelah semua lancar, baru mulai dengan lead asli.

## 8. Pemeliharaan
- **Ganti model Gemini:** Pengaturan → Model Gemini (berlaku langsung), atau ubah `GEMINI_MODEL` di `wrangler.jsonc` lalu `npm run deploy`.
- **Acara baru:** tambah entri di `config/events.ts` (termasuk `sheet_tab`), kolom di `VISIBLE_COLUMNS` (`src/domain/sheet-row.ts`), template di `config/templates.ts`, lalu `npm run setup:sheet`.
- **Log:** `npx wrangler tail`. Log tidak memuat nomor HP utuh atau isi pesan.

## 9. Pertanyaan untuk atasan
- FAQ resmi: gratis/tidak, parkir, dress code, makanan halal, boleh bawa anak, tambahan tamu.
- Jam operasional Roadshow (lalu isi di Pengaturan).
- Nama acara resmi Roadshow ("Medan Property Roadshow" vs "Pameran Properti Malaysia").
- SOP handoff Property Advisor: siapa yang dihubungi, berapa lama sampai PA menghubungi klien.
- Konfirmasi bahwa nama dalam kurung di Bitrix adalah nama agen.
- Izin memproses data klien (teks chat yang sudah disamarkan) lewat LLM pihak ketiga (Gemini).
- Persetujuan teks baru: A-H1, CROSS_EVENT-B, ASK_IF_BOT (halaman Template).
