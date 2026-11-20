export interface Env {
  ASSETS?: Fetcher;
  KV: KVNamespace;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  /** 'true' = wajib login dengan ADMIN_PASSWORD. Selain itu login dilewati (sementara). */
  REQUIRE_PASSWORD?: string;
  STORE?: string; // 'supabase' | 'sheets' | 'memory'
  SUPABASE_URL?: string;
  /** Server-side only. Never send to the browser. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SHEET_ID?: string;
  GOOGLE_SA_EMAIL?: string;
  GOOGLE_SA_PRIVATE_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
  GEMINI_API_BASE?: string;
}
