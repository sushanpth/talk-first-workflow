import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Fixture, git, makeFixture, note, write } from '../fixtures.test-helper.ts';
import { memoryDump } from '../memory.ts';
import { ProjectStore } from '../projects.ts';
import { hubPaths } from '../state.ts';
import { routeContext } from './context.ts';
import { resolveRoutes } from './resolve.ts';

vi.mock('../memory.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../memory.ts')>();
  return { ...actual, memoryDump: vi.fn(actual.memoryDump) };
});

let fx: Fixture;
let app: Hono;
let otherDir: string;

// A second project "alpha" that lists before "shop".
beforeEach(() => {
  fx = makeFixture();
  const repo = join(fx.tmp, 'work', 'alpha');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q');
  otherDir = join(fx.memoryRoot, 'alpha');
  write(join(otherDir, '.source'), `${repo}\n`);
  write(join(otherDir, 'cache.md'), note('cache', 'Cache rules.'));
  app = new Hono().route('/', resolveRoutes(routeContext(new ProjectStore(hubPaths()))));
});
afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

const resolve = async (kind: string, path: string) => {
  vi.mocked(memoryDump).mockClear();
  const res = await app.request(`/resolve?kind=${kind}&path=${encodeURIComponent(path)}`);
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  return { status: res.status, url: body.url, dumped: vi.mocked(memoryDump).mock.calls.map((c) => c[0]) };
};

describe('resolving a plan or note', () => {
  it('dumps only the project whose memory folder holds the file', async () => {
    expect(await resolve('note', join(fx.memoryDir, 'auth.md'))).toEqual({
      status: 200,
      url: '/p/shop/memory/auth',
      dumped: [fx.memoryDir],
    });
    expect(await resolve('plan', join(fx.memoryDir, 'briefs', '2026-10-23-login.md'))).toMatchObject({
      url: '/p/shop/plans/2026-10-23-login.md',
      dumped: [fx.memoryDir],
    });
    expect(await resolve('note', join(otherDir, 'cache.md'))).toMatchObject({
      url: '/p/alpha/memory/cache',
      dumped: [otherDir],
    });
  });

  it('follows a symlink to the owning project', async () => {
    const link = join(fx.tmp, 'auth-link.md');
    symlinkSync(join(fx.memoryDir, 'auth.md'), link);
    expect(await resolve('note', link)).toMatchObject({ url: '/p/shop/memory/auth', dumped: [fx.memoryDir] });
  });

  it('answers 404 for a file outside every memory folder, or of the wrong kind', async () => {
    expect(await resolve('note', join(fx.repo, 'README.md'))).toMatchObject({ status: 404, dumped: [] });
    expect((await resolve('plan', join(fx.memoryDir, 'auth.md'))).status).toBe(404);
  });
});
