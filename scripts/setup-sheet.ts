// npm run setup:sheet — create tabs, headers, dropdowns and default templates in the Google Sheet (idempotent).
import { setupSheet } from '../src/worker/services/setup';
import { SheetsStore } from '../src/worker/services/sheets';
import { loadDevVars } from './env';

const env = loadDevVars();
if (!env.SHEET_ID || !env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_PRIVATE_KEY) {
  console.error('Isi SHEET_ID, GOOGLE_SA_EMAIL dan GOOGLE_SA_PRIVATE_KEY di .dev.vars terlebih dahulu.');
  process.exit(1);
}
const store = new SheetsStore({ sheetId: env.SHEET_ID, saEmail: env.GOOGLE_SA_EMAIL, privateKeyPem: env.GOOGLE_SA_PRIVATE_KEY });
const log = await setupSheet(store);
console.log(log.length ? log.map((l) => `- ${l}`).join('\n') : 'Sheet sudah lengkap, tidak ada perubahan.');
