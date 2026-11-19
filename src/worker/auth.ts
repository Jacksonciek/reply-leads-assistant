// Single-account auth: HMAC-signed session cookie (HttpOnly, Secure, SameSite=Strict, 7 days).
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './env';

const COOKIE = 'sid';

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const MAX_AGE = 7 * 86400;

export async function makeSession(secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `${exp}.${await hmacHex(secret, `jackson.${exp}`)}`;
}

export async function verifySession(secret: string, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !secret) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return timingSafeEqual(sig, await hmacHex(secret, `jackson.${exp}`));
}

export async function passwordMatches(secret: string, input: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  return timingSafeEqual(await hmacHex(secret, input), await hmacHex(secret, expected));
}

export function setSessionCookie(c: Context, value: string) {
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, COOKIE, value, { httpOnly: true, secure, sameSite: 'Strict', path: '/', maxAge: MAX_AGE });
}
export function clearSessionCookie(c: Context) { deleteCookie(c, COOKIE, { path: '/' }); }

export const authRequired = (env: Env) => env.REQUIRE_PASSWORD === 'true';

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (authRequired(c.env) && !(await verifySession(c.env.SESSION_SECRET, getCookie(c, COOKIE)))) {
    return c.json({ error: { code: 'unauthorized', message: 'Please sign in first' } }, 401);
  }
  await next();
};

/** 5 attempts / 15 min / IP. Returns false when blocked. */
export async function rateLimitLogin(kv: KVNamespace, ip: string): Promise<boolean> {
  const k = `rl:${ip}`;
  const n = Number((await kv.get(k)) ?? 0);
  if (n >= 5) return false;
  await kv.put(k, String(n + 1), { expirationTtl: 15 * 60 });
  return true;
}
