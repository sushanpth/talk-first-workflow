import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

export const COOKIE = 'tfw_hub';

export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokensEqual(given: string | undefined, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only our own origin: a page that rebinds its DNS name to 127.0.0.1 still sends its own Host. */
export function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export interface GuardOptions {
  token: string;
  port: () => number;
}

const queryTokenOk = (url: string, token: string) =>
  tokensEqual(new URL(url).searchParams.get('token') ?? undefined, token);

// c.req.path is the decoded path the router matches on, so `/%61pi` counts as `/api`.
const isApiPath = (path: string) => path === '/api' || path.startsWith('/api/');

/**
 * Host check on every request. A valid `?token=` sets the cookie; a page opened with it
 * is redirected to drop the token from the URL. Auth itself is enforced by `requireAuth`.
 */
export function guard({ token, port }: GuardOptions): MiddlewareHandler {
  return async (c, next) => {
    if (!hostAllowed(c.req.header('host'), port())) return c.json({ error: 'forbidden host' }, 403);
    const queryOk = queryTokenOk(c.req.url, token);
    if (queryOk) {
      setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' });
    }
    const isApi = isApiPath(c.req.path);
    if (!isApi && queryOk && c.req.method === 'GET') {
      const url = new URL(c.req.url);
      url.searchParams.delete('token');
      return c.redirect(`${url.pathname}${url.search}`, 303);
    }
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    if (isApi) c.header('Cache-Control', 'no-store');
  };
}

/**
 * Needs the token cookie or `?token=`. Mounted on the whole API sub-app, so every API route
 * is covered however its path was encoded; only authenticated requests count as activity.
 */
export function requireAuth(token: string, onActivity?: () => void): MiddlewareHandler {
  return async (c, next) => {
    if (!queryTokenOk(c.req.url, token) && !tokensEqual(getCookie(c, COOKIE), token)) {
      return c.json({ error: 'unauthorized: open the hub again with `node hub/cli.ts open`' }, 401);
    }
    onActivity?.();
    await next();
  };
}
