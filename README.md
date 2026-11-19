# Generator Balasan WhatsApp (Roadshow & Jesselton)

Website pribadi untuk menyusun pesan konfirmasi kehadiran. Template disusun oleh kode, balasan bebas dibantu Gemini, dan Google Sheets menjadi database. Website **tidak** terhubung ke WhatsApp dan tidak pernah mengirim pesan sendiri.

- Stack: Cloudflare Worker (Hono + Static Assets), React + Vite + Tailwind, Google Sheets API, Gemini API.
- Kode domain murni: `src/domain/` (dipakai frontend dan worker).
- Panduan lengkap: [RUNBOOK.md](RUNBOOK.md). Asumsi: [DECISIONS.md](DECISIONS.md).

```powershell
npm install
```
```powershell
npm run dev
```
```powershell
npm test
```
