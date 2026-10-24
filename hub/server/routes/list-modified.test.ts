import { rmSync } from 'node:fs';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Fixture, makeFixture } from '../fixtures.test-helper.ts';
import { modifiedAt } from '../paths.ts';
import { ProjectStore } from '../projects.ts';
import { hubPaths } from '../state.ts';
import { routeContext } from './context.ts';
import { docRoutes } from './docs.ts';
import { memoryRoutes } from './memory.ts';

vi.mock('../paths.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../paths.ts')>();
  return { ...actual, modifiedAt: vi.fn(actual.modifiedAt) };
});

let fx: Fixture;
let app: Hono;

beforeEach(() => {
  fx = makeFixture();
  const ctx = routeContext(new ProjectStore(hubPaths()));
  app = new Hono().route('/', memoryRoutes(ctx)).route('/', docRoutes(ctx));
  vi.mocked(modifiedAt).mockClear();
});
afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

const statsFor = async (path: string) => {
  vi.mocked(modifiedAt).mockClear();
  const res = await app.request(path);
  expect(res.status, path).toBe(200);
  const body = (await res.json()) as { items: { modified: string | null }[] };
  return { stats: vi.mocked(modifiedAt).mock.calls.length, items: body.items };
};

describe('modified times on list pages', () => {
  it('stats only the returned page unless sorting by modified', async () => {
    for (const list of ['memory', 'docs']) {
      const page = await statsFor(`/projects/shop/${list}?limit=1`);
      expect(page.stats, list).toBe(1);
      expect(page.items[0]?.modified, list).toEqual(expect.any(String));
      expect((await statsFor(`/projects/shop/${list}?limit=1&sort=modified`)).stats, list).toBe(2);
    }
  });
});
