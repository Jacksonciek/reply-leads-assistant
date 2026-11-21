import type { Env } from '../env';
import { GeminiClient, type LlmClient } from './llm';
import { Repo } from './repo';
import { SheetsStore } from './sheets';
import { memoryStore, type Store } from './store';
import { SupabaseStore } from './supabase';

export interface Services {
  store: Store;
  repo: Repo;
  /** null when GEMINI_API_KEY is not set. `model` overrides GEMINI_MODEL (from the Config sheet). */
  llm: (model?: string) => LlmClient | null;
}

export type ServicesFactory = (env: Env) => Services;

function requireEnv(v: string | undefined, name: string): string {
  if (!v) throw new Error(`${name} is not set. Add it as a secret (Cloudflare: Worker → Settings → Variables and Secrets; local: .dev.vars). Data is not saved until then.`);
  return v;
}

export function storeKind(env: Env): 'supabase' | 'sheets' | 'memory' {
  // Never fall back to memory silently: that loses every lead on the next reload.
  if (env.STORE === 'supabase') return 'supabase';
  if (env.STORE !== 'memory' && env.STORE !== 'supabase' && env.SHEET_ID) return 'sheets';
  return 'memory';
}

export function makeServices(env: Env): Services {
  const store: Store = storeKind(env) === 'supabase'
    ? new SupabaseStore({ url: requireEnv(env.SUPABASE_URL, 'SUPABASE_URL'), serviceKey: requireEnv(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY') })
    : storeKind(env) === 'sheets'
      ? new SheetsStore({ sheetId: env.SHEET_ID!, saEmail: env.GOOGLE_SA_EMAIL ?? '', privateKeyPem: env.GOOGLE_SA_PRIVATE_KEY ?? '', kv: env.KV })
      : memoryStore();
  return {
    store,
    repo: new Repo(store),
    llm: (model) => env.GEMINI_API_KEY
      ? new GeminiClient({
        apiKey: env.GEMINI_API_KEY,
        model: model || env.GEMINI_MODEL || 'gemini-flash-lite-latest',
        fallbackModel: env.GEMINI_FALLBACK_MODEL,
        baseUrl: env.GEMINI_API_BASE,
      })
      : null,
  };
}
