import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { type Fixture, git, makeFixture, write } from './fixtures.test-helper.ts';
import { ProjectStore, registerRepo } from './projects.ts';
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
  app = createApp({ token: TOKEN, port: () => PORT, projects: new ProjectStore(hubPaths()), dist });
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
    expect(body.map((p: { id: string }) => p.id)).toEqual(['shop', 'other']);
    expect(body[0]).toMatchObject({ repo: fx.repo, memoryDir: fx.memoryDir, noteCount: 2, briefCount: 1 });
  });

  it('allows reading repos, memory folders and the transcripts dir', async () => {
    const transcripts = join(fx.tmp, 'claude', 'projects', fx.repo.replace(/[^A-Za-z0-9]/g, '-'));
    expect(await new ProjectStore(hubPaths()).roots()).toEqual([fx.repo, fx.memoryDir, transcripts]);
  });

  it('serves plans and memory notes', async () => {
    expect((await api('/api/projects/shop/plans')).body).toEqual([
      {
        file: '2026-10-23-login.md',
        title: 'Login page',
        path: join(fx.memoryDir, 'briefs', '2026-10-23-login.md'),
      },
    ]);
    expect((await api('/api/projects/shop/plans/2026-10-23-login.md')).body.body).toContain(
      '# Brief: Login page',
    );
    const memory = await api('/api/projects/shop/memory');
    expect(memory.body.notes.map((n: { name: string }) => n.name)).toEqual(['auth', 'redis']);
    expect((await api('/api/projects/shop/memory/redis')).body.backlinks).toEqual(['auth']);
    expect((await api('/api/projects/shop/memory/nope')).status).toBe(404);
    expect((await api('/api/projects/nope/memory')).status).toBe(404);
  });

  it('serves tracked markdown docs only', async () => {
    expect((await api('/api/projects/shop/docs')).body).toEqual(['README.md', 'docs/guide.md']);
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

    expect((await api('/api/projects/shop/worktrees')).body).toEqual([
      expect.objectContaining({ name: 'agent-1', branch: 'agent-1' }),
    ]);
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

    expect((await api('/api/projects/shop/worktrees')).body).toEqual([
      expect.objectContaining({ name: 'agent-a1', branch: 'tf/login', ...label }),
    ]);
    expect((await api('/api/projects/shop/worktrees/agent-a1')).body).toMatchObject(label);
  });

  it('leaves the agent fields null when no record matches', async () => {
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'x', join(fx.repo, '.claude', 'worktrees', 'x'));
    expect((await api('/api/projects/shop/worktrees')).body[0]).toMatchObject({
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
