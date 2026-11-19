import type { Env } from '../env';
import { GeminiClient, type LlmClient } from './llm';
import { Repo } from './repo';
import { SheetsStore } from './sheets';
import { memoryStore, type Store } from './store';

export interface Services {
  store: Store;
  repo: Repo;
  /** null when GEMINI_API_KEY is not set. `model` overrides GEMINI_MODEL (from the Config sheet). */
  llm: (model?: string) => LlmClient | null;
}

export type ServicesFactory = (env: Env) => Services;

export function makeServices(env: Env): Services {
  const store: Store = env.STORE === 'memory' || !env.SHEET_ID
    ? memoryStore()
    : new SheetsStore({ sheetId: env.SHEET_ID, saEmail: env.GOOGLE_SA_EMAIL ?? '', privateKeyPem: env.GOOGLE_SA_PRIVATE_KEY ?? '', kv: env.KV });
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
