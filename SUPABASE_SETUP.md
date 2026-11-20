# Pindah ke Supabase: langkah demi langkah

Supabase dipakai sebagai database pengganti Google Sheets. Paket gratisnya: 500 MB, cukup untuk ratusan ribu pesan.
Catatan: project gratis di-*pause* kalau 7 hari tidak dipakai. Klik **Restore** di dashboard untuk menyalakannya lagi. Data tidak hilang.

## 1. Buat project
1. Buka https://supabase.com, lalu **Start your project** dan login (bisa pakai GitHub).
2. **New project**:
   - Name: `reply-assistant`
   - Database password: buat yang kuat, lalu simpan
   - Region: **Southeast Asia (Singapore)**
3. Tunggu sekitar 2 menit sampai project siap.

## 2. Buat tabel
1. Menu kiri: **SQL Editor**, lalu **New query**.
2. Copy seluruh isi file [`supabase/schema.sql`](supabase/schema.sql), paste, lalu klik **Run**. Harus muncul "Success".

## 3. Ambil URL dan kunci
1. Buka **Project Settings → Data API** dan copy **Project URL** (`https://xxxx.supabase.co`).
2. Buka **Project Settings → API Keys** dan copy kunci **service_role** (secret). Di versi dashboard yang lebih baru, namanya *Secret key*.
   - Kunci ini setara password admin database. Jangan dikirim ke siapa pun dan jangan ditaruh di frontend atau di Git.

## 4. Isi `.dev.vars`
Ubah atau tambahkan baris berikut di `.dev.vars` (file ini tidak ikut di-commit):
```
STORE=supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=kunci-service-role-tadi
```
Baris `SHEET_ID` dan `GOOGLE_SA_*` boleh dibiarkan. Selama `STORE=supabase`, baris itu tidak dipakai.

## 5. Jalankan dan siapkan tab
1. Jalankan `npm run dev`, lalu buka app.
2. Buka **More → Settings** dan klik **Run setup**. Ini membuat header, template default, dan config. Di Settings, baris storage harus menunjukkan `storage = supabase`.

## 6. Masukkan data
1. **Leads:** buka **More → Import** dan upload `data/Roadshow__Jesselton.xlsx`.
2. **Pesan pertama yang sudah terkirim:** buka **Bulk → First message**, lalu klik **Mark as sent** di tiap lead. Teksnya sama dengan template, dan salamnya mengikuti jam saat ini.
3. **Reminder yang sudah terkirim** (Ridwan, Jumita, Marnold, Agustina, Moan, Anita): buka room, pilih template reminder, lalu klik **Mark as sent**.
4. **Lead yang sudah saling balas** (Bolon, Welly, Partahi, dr. Defi): buka room, klik **Lead's reply**, lalu paste percakapannya dalam format:
   ```
   Pak Bolon: Ok, terimakasih pak buk
   Saya: Sama-sama, Pak Bolon 😊 ...
   ```
   Baris yang diawali `Saya:` dihitung sebagai pesanmu, sisanya pesan klien. Pesan yang panjangnya beberapa baris tetap jadi satu pesan. Isi `chat.txt` dari export WhatsApp juga bisa dipaste langsung.

## 7. Deploy (nanti)
```
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```
Lalu ganti `"STORE": "sheets"` menjadi `"STORE": "supabase"` di bagian `vars` pada `wrangler.jsonc`.

## Melihat data
Buka **Table Editor → sheet_rows**. Setiap baris berisi `tab` (Roadshow, Jesselton, Messages, Drafts, …), nomor `row` (baris 1 adalah header), dan `cells` (isi kolomnya).
