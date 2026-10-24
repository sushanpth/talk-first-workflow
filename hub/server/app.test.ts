import { mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { type Fixture, git, makeFixture, transcriptsIn, write } from './fixtures.test-helper.ts';
import { ProjectStore, registerRepo } from './projects.ts';
import { helloProof } from './security.ts';
import { hubPaths } from './state.ts';

const TOKEN = 'test-token-0123456789';
const PORT = 4321;
const HOST = `127.0.0.1:${PORT}`;

let fx: Fixture;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  fx = makeFixture();
  const dist = join(fx.tmp, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  app = createApp({
    token: TOKEN,
    port: () => PORT,
    projects: new ProjectStore(hubPaths()),
    dist,
    version: '1.2.3',
    build: 'abc',
  });
});
afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers: { host: HOST, ...headers } });
// biome-ignore lint/suspicious/noExplicitAny: assertions below check the shape.
type Json = any;
const api = async (path: string): Promise<{ status: number; body: Json }> => {
  const res = await get(`${path}${path.includes('?') ? '&' : '?'}token=${TOKEN}`);
  return { status: res.status, body: await res.json() };
};

describe('token, cookie and Host checks', () => {
  it('rejects API calls without the token', async () => {
    expect((await get('/api/health')).status).toBe(401);
    expect((await get('/api/projects?token=wrong')).status).toBe(401);
    expect((await get('/api/projects', { cookie: 'tfw_hub=wrong' })).status).toBe(401);
  });

  it('rejects percent-encoded API paths without the token', async () => {
    for (const path of [
      '/api',
      '/%61pi',
      '/%61pi/projects',
      '/ap%69/health',
      '/api/projects/sho%70/memory',
      '/%61pi/projects/shop/plans',
      `/%61pi/resolve?kind=project&repo=${encodeURIComponent(fx.repo)}`,
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(401);
    }
    expect((await get(`/%61pi/health?token=${TOKEN}`)).status).toBe(200);
  });

  it('counts only authenticated API requests as activity', async () => {
    let hits = 0;
    const counted = createApp({
      token: TOKEN,
      port: () => PORT,
      projects: new ProjectStore(hubPaths()),
      dist: join(fx.tmp, 'dist'),
      version: '1.2.3',
      build: 'abc',
      onActivity: () => {
        hits += 1;
      },
    });
    await counted.request('/api/health', { headers: { host: 'evil.example' } });
    await counted.request('/api/health', { headers: { host: HOST } });
    await counted.request('/%61pi/health', { headers: { host: HOST } });
    expect(hits).toBe(0);
    await counted.request(`/api/health?token=${TOKEN}`, { headers: { host: HOST } });
    expect(hits).toBe(1);
  });

  it('accepts the token in the query or the cookie', async () => {
    expect((await get(`/api/health?token=${TOKEN}`)).status).toBe(200);
    expect((await get('/api/health', { cookie: `tfw_hub=${TOKEN}` })).status).toBe(200);
  });

  it('reports which hub it is on /api/health', async () => {
    expect((await api('/api/health')).body).toEqual({
      ok: true,
      app: 'talk-first-hub',
      pid: process.pid,
      version: '1.2.3',
      build: 'abc',
    });
  });

  it('answers the hello challenge without the token, with a proof bound to the token and port', async () => {
    const nonce = 'n'.repeat(32);
    const res = await get(`/api/hello?nonce=${nonce}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.json()).toEqual({
      ok: true,
      app: 'talk-first-hub',
      pid: process.pid,
      version: '1.2.3',
      build: 'abc',
      proof: helloProof(TOKEN, PORT, nonce),
    });
    expect(helloProof(TOKEN, PORT, nonce)).not.toBe(helloProof(TOKEN, PORT + 1, nonce));
    expect((await get('/api/hello?nonce=short')).status).toBe(400);
    expect((await get('/api/hello')).status).toBe(400);
    expect(
      (await app.request(`/api/hello?nonce=${nonce}`, { headers: { host: 'evil.example' } })).status,
    ).toBe(403);
  });

  it('sets an HttpOnly SameSite=Strict cookie and strips the token from page URLs', async () => {
    const res = await get(`/p/shop/plans?x=1&token=${TOKEN}`);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/p/shop/plans?x=1');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`tfw_hub=${TOKEN}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('rejects other Host headers, even with the token', async () => {
    for (const host of ['evil.example:4321', '127.0.0.1:9999', 'localhost', '']) {
      const res = await app.request(`/api/health?token=${TOKEN}`, { headers: { host } });
      expect(res.status, host).toBe(403);
    }
    expect((await get(`/api/health?token=${TOKEN}`, { host: `localhost:${PORT}` })).status).toBe(200);
  });

  it('sends no CORS headers', async () => {
    const res = await get(`/api/health?token=${TOKEN}`, { origin: 'http://evil.example' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves the app shell without the token, with a CSP', async () => {
    const res = await get('/p/shop/memory/auth');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect((await get('/assets/app.js')).headers.get('content-type')).toContain('javascript');
    expect((await get('/assets/missing.js')).status).toBe(404);
  });
});

describe('API', () => {
  it('lists projects, including registered repos without a memory folder under the root', async () => {
    const other = join(fx.tmp, 'work', 'other');
    mkdirSync(other, { recursive: true });
    git(other, 'init', '-q');
    registerRepo(hubPaths(), other);
    const { body } = await api('/api/projects');
    expect(body.items.map((p: { id: string }) => p.id)).toEqual(['other', 'shop']);
    expect(body).toMatchObject({ total: 2, nextOffset: null });
    expect(body.items[1]).toMatchObject({
      repo: fx.repo,
      memoryDir: fx.memoryDir,
      noteCount: 2,
      briefCount: 1,
    });
  });

  it('allows reading repos, memory folders and every transcripts dir', async () => {
    const transcripts = [join(fx.tmp, 'claude'), join(fx.home, '.claude-work')].map((h) =>
      transcriptsIn(h, fx.repo),
    );
    for (const dir of transcripts) mkdirSync(dir, { recursive: true });
    expect(await new ProjectStore(hubPaths()).roots()).toEqual([fx.repo, fx.memoryDir, ...transcripts]);
  });

  it('serves plans and memory notes', async () => {
    expect((await api('/api/projects/shop/plans')).body).toEqual({
      items: [
        {
          file: '2026-10-23-login.md',
          title: 'Login page',
          path: join(fx.memoryDir, 'briefs', '2026-10-23-login.md'),
          date: '2026-10-23',
        },
      ],
      total: 1,
      nextOffset: null,
    });
    expect((await api('/api/projects/shop/plans/2026-10-23-login.md')).body.body).toContain(
      '# Brief: Login page',
    );
    const memory = await api('/api/projects/shop/memory');
    expect(memory.body.items.map((n: { name: string }) => n.name)).toEqual(['auth', 'redis']);
    expect(memory.body).toMatchObject({ memoryDir: fx.memoryDir, index: '- [Auth](auth.md)\n', total: 2 });
    expect((await api('/api/projects/shop/memory/redis')).body.backlinks).toEqual(['auth']);
    expect((await api('/api/projects/shop/memory/nope')).status).toBe(404);
    expect((await api('/api/projects/nope/memory')).status).toBe(404);
  });

  it('serves tracked markdown docs only', async () => {
    expect((await api('/api/projects/shop/docs')).body).toEqual({
      items: [
        { path: 'docs/guide.md', modified: expect.any(String) },
        { path: 'README.md', modified: expect.any(String) },
      ],
      total: 2,
      nextOffset: null,
    });
    expect((await api('/api/projects/shop/doc?path=docs/guide.md')).body).toEqual({
      path: 'docs/guide.md',
      text: '# Guide\n',
    });
    write(join(fx.tmp, 'secret.md'), 'secret');
    expect((await api('/api/projects/shop/doc?path=../../secret.md')).status).toBe(404);
    expect((await api(`/api/projects/shop/doc?path=${join(fx.tmp, 'secret.md')}`)).status).toBe(404);
  });

  it('refuses a tracked doc whose symlink points outside the repo', async () => {
    write(join(fx.tmp, 'secret.md'), 'secret');
    symlinkSync(join(fx.tmp, 'secret.md'), join(fx.repo, 'leak.md'));
    git(fx.repo, 'add', 'leak.md');
    expect((await api('/api/projects/shop/doc?path=leak.md')).status).toBe(403);
  });

  it('lists worktrees and serves per-file diffs', async () => {
    const wt = join(fx.repo, '.claude', 'worktrees', 'agent-1');
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'agent-1', wt);
    write(join(wt, 'src', 'app.txt'), 'one\nTWO\n');
    const base = git(fx.repo, 'rev-parse', 'HEAD').trim();

    expect((await api('/api/projects/shop/worktrees')).body).toEqual({
      items: [expect.objectContaining({ name: 'agent-1', branch: 'agent-1' })],
      total: 1,
      nextOffset: null,
    });
    const diff = await api('/api/projects/shop/worktrees/agent-1');
    expect(diff.body).toMatchObject({ base, files: [{ status: 'M', path: 'src/app.txt' }] });
    const file = await api('/api/projects/shop/worktrees/agent-1/file?path=src/app.txt');
    expect(file.body).toMatchObject({ original: 'one\ntwo\n', modified: 'one\nTWO\n', binary: false });
    expect((await api('/api/projects/shop/worktrees/agent-1/file?path=README.md')).status).toBe(404);
    expect((await api('/api/projects/shop/worktrees/agent-1?base=--output=x')).status).toBe(400);
  });

  it('labels a worktree with the task and brief of the agent that ran in it', async () => {
    const wt = join(fx.repo, '.claude', 'worktrees', 'agent-a1');
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'tf/login', wt);
    const subagents = join(
      fx.tmp,
      'claude',
      'projects',
      fx.repo.replace(/[^A-Za-z0-9]/g, '-'),
      's1',
      'subagents',
    );
    const brief = join(fx.memoryDir, 'briefs', '2026-10-23-login.md');
    write(
      join(subagents, 'agent-a1.meta.json'),
      JSON.stringify({ agentType: 'implementer', description: 'Implement: Login page', worktreePath: wt }),
    );
    write(
      join(subagents, 'agent-a1.jsonl'),
      `${JSON.stringify({ message: { content: `Brief: ${brief}` } })}\n`,
    );
    const label = {
      task: 'Implement: Login page',
      agentType: 'implementer',
      agentId: 'a1',
      briefPath: brief,
    };

    expect((await api('/api/projects/shop/worktrees')).body.items).toEqual([
      expect.objectContaining({ name: 'agent-a1', branch: 'tf/login', ...label }),
    ]);
    expect((await api('/api/projects/shop/worktrees/agent-a1')).body).toMatchObject(label);
  });

  it('leaves the agent fields null when no record matches', async () => {
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'x', join(fx.repo, '.claude', 'worktrees', 'x'));
    expect((await api('/api/projects/shop/worktrees')).body.items[0]).toMatchObject({
      task: null,
      agentType: null,
      agentId: null,
      briefPath: null,
    });
  });

  it('resolves launcher targets to UI URLs', async () => {
    const brief = join(fx.memoryDir, 'briefs', '2026-10-23-login.md');
    expect((await api(`/api/resolve?kind=plan&path=${brief}`)).body.url).toBe(
      '/p/shop/plans/2026-10-23-login.md',
    );
    expect((await api(`/api/resolve?kind=note&path=${join(fx.memoryDir, 'auth.md')}`)).body.url).toBe(
      '/p/shop/memory/auth',
    );
    expect((await api(`/api/resolve?kind=project&repo=${fx.repo}`)).body.url).toBe('/p/shop/plans');
    expect((await api(`/api/resolve?kind=doc&repo=${fx.repo}&path=docs/guide.md`)).body.url).toBe(
      '/p/shop/docs/docs/guide.md',
    );
    expect((await api(`/api/resolve?kind=plan&path=${join(fx.tmp, 'elsewhere.md')}`)).status).toBe(404);
  });
});

const at = (iso: string) => new Date(iso);
const touch = (path: string, iso: string) => utimesSync(path, at(iso), at(iso));
const field = (body: Json, key: string) => body.items.map((item: Record<string, unknown>) => item[key]);

describe('list routes', () => {
  const lists = [
    'projects',
    'projects/shop/plans',
    'projects/shop/memory',
    'projects/shop/docs',
    'projects/shop/worktrees',
  ];

  it('answers every list with a page', async () => {
    for (const list of lists) {
      const { status, body } = await api(`/api/${list}`);
      expect(status, list).toBe(200);
      expect(body, list).toMatchObject({
        items: expect.any(Array),
        total: expect.any(Number),
        nextOffset: null,
      });
    }
  });

  it('answers 400 on bad query values', async () => {
    for (const list of lists) {
      for (const query of ['sort=nope', 'order=up', 'limit=0', 'limit=201', 'offset=-1', 'limit=abc']) {
        const { status, body } = await api(`/api/${list}?${query}`);
        expect(status, `${list}?${query}`).toBe(400);
        expect(body.error, `${list}?${query}`).toEqual(expect.any(String));
      }
    }
    expect((await api('/api/projects/shop/memory?type=other')).status).toBe(400);
    expect((await api('/api/projects/shop/plans?sort=modified')).status).toBe(400);
  });

  it('pages, filters and sorts plans, newest first by default', async () => {
    for (let day = 1; day <= 9; day += 1)
      write(join(fx.memoryDir, 'briefs', `2026-09-0${day}-p${day}.md`), `# Brief: Plan ${day}\n`);
    write(join(fx.memoryDir, 'briefs', 'undated.md'), '# Brief: Undated\n');

    const first = await api('/api/projects/shop/plans?limit=4');
    expect(first.body).toMatchObject({ total: 11, nextOffset: 4 });
    expect(field(first.body, 'date')).toEqual(['2026-10-23', '2026-09-09', '2026-09-08', '2026-09-07']);
    const last = await api('/api/projects/shop/plans?limit=4&offset=8');
    expect(last.body).toMatchObject({ total: 11, nextOffset: null });
    expect(field(last.body, 'date')).toEqual(['2026-09-02', '2026-09-01', null]);

    expect(field((await api('/api/projects/shop/plans?sort=date&order=asc&limit=2')).body, 'title')).toEqual([
      'Plan 1',
      'Plan 2',
    ]);
    expect(field((await api('/api/projects/shop/plans?sort=title&limit=3')).body, 'title')).toEqual([
      'Login page',
      'Plan 1',
      'Plan 2',
    ]);
    const login = await api('/api/projects/shop/plans?q=LOGIN');
    expect(login.body).toMatchObject({ total: 1, nextOffset: null });
    expect(field(login.body, 'file')).toEqual(['2026-10-23-login.md']);
  });

  it('filters memory by text and type and sorts by modified time', async () => {
    write(
      join(fx.memoryDir, 'style.md'),
      '---\nname: style\ndescription: Short comments\nmetadata:\n  type: feedback\n---\n\nKeep it short.\n',
    );
    touch(join(fx.memoryDir, 'auth.md'), '2026-10-01T00:00:00Z');
    touch(join(fx.memoryDir, 'redis.md'), '2026-10-03T00:00:00Z');
    touch(join(fx.memoryDir, 'style.md'), '2026-10-02T00:00:00Z');

    const all = await api('/api/projects/shop/memory');
    expect(field(all.body, 'name')).toEqual(['auth', 'redis', 'style']);
    expect(all.body.items[0].modified).toBe('2026-10-01T00:00:00.000Z');
    expect(field((await api('/api/projects/shop/memory?sort=modified')).body, 'name')).toEqual([
      'redis',
      'style',
      'auth',
    ]);
    expect(field((await api('/api/projects/shop/memory?sort=type&order=desc')).body, 'type')).toEqual([
      'project',
      'project',
      'feedback',
    ]);
    const feedback = await api('/api/projects/shop/memory?type=feedback');
    expect(feedback.body).toMatchObject({ total: 1, index: '- [Auth](auth.md)\n', memoryDir: fx.memoryDir });
    expect(field(feedback.body, 'name')).toEqual(['style']);
    expect(field((await api('/api/projects/shop/memory?q=short')).body, 'name')).toEqual(['style']);
    expect((await api('/api/projects/shop/memory?type=user')).body).toMatchObject({ items: [], total: 0 });
  });

  it('sorts docs by modified time and filters by path', async () => {
    touch(join(fx.repo, 'README.md'), '2026-10-01T00:00:00Z');
    touch(join(fx.repo, 'docs', 'guide.md'), '2026-10-05T00:00:00Z');
    const docs = await api('/api/projects/shop/docs?sort=modified');
    expect(docs.body.items).toEqual([
      { path: 'docs/guide.md', modified: '2026-10-05T00:00:00.000Z' },
      { path: 'README.md', modified: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(field((await api('/api/projects/shop/docs?q=GUIDE')).body, 'path')).toEqual(['docs/guide.md']);
    rmSync(join(fx.repo, 'README.md'));
    expect((await api('/api/projects/shop/docs?q=readme')).body.items).toEqual([
      { path: 'README.md', modified: null },
    ]);
  });

  it('gives no modified time for a doc whose symlink points outside the repo', async () => {
    write(join(fx.tmp, 'secret.md'), 'secret');
    symlinkSync(join(fx.tmp, 'secret.md'), join(fx.repo, 'leak.md'));
    git(fx.repo, 'add', 'leak.md');
    const leak = await api('/api/projects/shop/docs?q=leak');
    expect(leak.body.items).toEqual([{ path: 'leak.md', modified: null }]);
  });

  it('sorts worktrees by branch and filters them by name', async () => {
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'zz', join(fx.repo, '.claude', 'worktrees', 'one'));
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'aa', join(fx.repo, '.claude', 'worktrees', 'two'));
    expect(field((await api('/api/projects/shop/worktrees?sort=branch')).body, 'name')).toEqual([
      'two',
      'one',
    ]);
    expect(field((await api('/api/projects/shop/worktrees?sort=branch&order=desc')).body, 'name')).toEqual([
      'one',
      'two',
    ]);
    const one = await api('/api/projects/shop/worktrees?q=ONE&limit=1');
    expect(one.body).toMatchObject({ total: 1, nextOffset: null });
    expect(field(one.body, 'name')).toEqual(['one']);
  });

  it('filters and sorts projects by name', async () => {
    const other = join(fx.tmp, 'work', 'other');
    mkdirSync(other, { recursive: true });
    git(other, 'init', '-q');
    registerRepo(hubPaths(), other);
    expect(field((await api('/api/projects?order=desc')).body, 'id')).toEqual(['shop', 'other']);
    expect(field((await api('/api/projects?q=oth')).body, 'id')).toEqual(['other']);
    expect((await api('/api/projects?limit=1')).body).toMatchObject({ total: 2, nextOffset: 1 });
  });
});
