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

/**
 * Host check on every request; `/api` needs the token cookie or `?token=`.
 * A page opened with `?token=` gets the cookie and is redirected to drop the token from the URL.
 */
export function guard({ token, port }: GuardOptions): MiddlewareHandler {
  return async (c, next) => {
    if (!hostAllowed(c.req.header('host'), port())) return c.json({ error: 'forbidden host' }, 403);
    const url = new URL(c.req.url);
    const queryToken = url.searchParams.get('token') ?? undefined;
    const queryOk = tokensEqual(queryToken, token);
    if (queryOk) {
      setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' });
    }
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (isApi && !queryOk && !tokensEqual(getCookie(c, COOKIE), token)) {
      return c.json({ error: 'unauthorized: open the hub again with `node hub/cli.ts open`' }, 401);
    }
    if (!isApi && queryOk && c.req.method === 'GET') {
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
