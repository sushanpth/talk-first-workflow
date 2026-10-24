import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { Hono } from 'hono';
import { realInside } from '../paths.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

// Monaco sets inline styles. No remote images, so untrusted markdown can't track the reader.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

/** The built web app: assets from `dist`, and index.html for every other path so the router can take it. */
export function staticRoutes(dist: string): Hono {
  const routes = new Hono();

  routes.get('*', async (c) => {
    let path = '';
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text('bad path', 400);
    }
    const asset = await realInside([dist], join(dist, path));
    if (asset && (await stat(asset)).isFile()) {
      const type = MIME[extname(asset)] ?? 'application/octet-stream';
      const headers: Record<string, string> = { 'Content-Type': type };
      if (dirname(asset).endsWith('/assets'))
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      if (type.startsWith('text/html')) headers['Content-Security-Policy'] = CSP;
      return c.body(await readFile(asset), 200, headers);
    }
    if (path.startsWith('/assets/')) return c.text('not found', 404);
    const index = await readFile(join(dist, 'index.html')).catch(() => null);
    if (!index) return c.text('The hub is not built yet. Run `node hub/cli.ts open`.', 503);
    return c.body(index, 200, { 'Content-Type': MIME['.html'] ?? '', 'Content-Security-Policy': CSP });
  });

  return routes;
}
