import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { trackedFiles } from './code.ts';
import { CODE_FILE_MAX_BYTES, CODE_MATCH_LINE_MAX, CODE_SEARCH_MAX_MATCHES } from './code-types.ts';
import { type Fixture, git, makeFixture, write } from './fixtures.test-helper.ts';
import { ProjectStore } from './projects.ts';
import { hubPaths } from './state.ts';

const TOKEN = 'test-token-0123456789';
const PORT = 4321;
const HOST = `127.0.0.1:${PORT}`;

let fx: Fixture;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  fx = makeFixture();
  const dist = join(fx.tmp, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  app = createApp({ token: TOKEN, port: () => PORT, projects: new ProjectStore(hubPaths()), dist });
});
afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

const get = (path: string) => app.request(path, { headers: { host: HOST } });
// biome-ignore lint/suspicious/noExplicitAny: assertions below check the shape.
type Json = any;
const api = async (path: string): Promise<{ status: number; body: Json }> => {
  const res = await get(`/api/projects/shop/code/${path}${path.includes('?') ? '&' : '?'}token=${TOKEN}`);
  return { status: res.status, body: await res.json() };
};
const enc = encodeURIComponent;

function commit(files: Record<string, string | Buffer>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(fx.repo, path, '..'), { recursive: true });
    writeFileSync(join(fx.repo, path), text);
  }
  git(fx.repo, 'add', '.');
  git(fx.repo, 'commit', '-qm', 'more');
}

describe('code routes auth and validation', () => {
  it('rejects every code route without the token', async () => {
    for (const path of ['tree', 'files', 'file?path=README.md', 'search?q=x', 'resolve?refs=README.md']) {
      expect((await get(`/api/projects/shop/code/${path}`)).status, path).toBe(401);
    }
  });

  it('answers 400 on bad queries', async () => {
    expect((await api('tree?path=../x')).status).toBe(400);
    expect((await api('file')).status).toBe(400);
    expect((await api('file?path=/etc/passwd')).status).toBe(400);
    expect((await api('search')).status).toBe(400);
    expect((await api('files?limit=0')).status).toBe(400);
    expect((await api('resolve')).status).toBe(400);
  });
});

describe('tree', () => {
  it('lists one level, directories first', async () => {
    commit({ 'src/lib/deep.txt': 'x', 'b.txt': 'b' });
    const root = await api('tree');
    expect(root.status).toBe(200);
    expect(root.body).toEqual({
      path: '',
      entries: [
        { name: 'docs', path: 'docs', type: 'dir' },
        { name: 'src', path: 'src', type: 'dir' },
        { name: 'b.txt', path: 'b.txt', type: 'file' },
        { name: 'README.md', path: 'README.md', type: 'file' },
      ],
    });
    const src = await api('tree?path=src/');
    expect(src.body).toEqual({
      path: 'src',
      entries: [
        { name: 'lib', path: 'src/lib', type: 'dir' },
        { name: 'app.txt', path: 'src/app.txt', type: 'file' },
      ],
    });
    expect((await api('tree?path=nope')).status).toBe(404);
    expect((await api('tree?path=README.md')).status).toBe(404);
  });

  it('leaves out untracked and ignored files', async () => {
    commit({ '.gitignore': 'secret.txt\n' });
    write(join(fx.repo, 'secret.txt'), 'hidden');
    write(join(fx.repo, 'loose.txt'), 'untracked');
    const names = (await api('tree')).body.entries.map((e: Json) => e.name);
    expect(names).toContain('.gitignore');
    expect(names).not.toContain('secret.txt');
    expect(names).not.toContain('loose.txt');
  });

  it('caches the file list until the index changes', async () => {
    const first = await trackedFiles(fx.repo);
    expect(await trackedFiles(fx.repo)).toBe(first);
    write(join(fx.repo, 'new.txt'), 'n');
    git(fx.repo, 'add', 'new.txt');
    const second = await trackedFiles(fx.repo);
    expect(second).not.toBe(first);
    expect(second.set.has('new.txt')).toBe(true);
    const names = (await api('tree')).body.entries.map((e: Json) => e.name);
    expect(names).toContain('new.txt');
  });

  it('follows the gitfile of a linked worktree to its own index', async () => {
    const wt = join(fx.tmp, 'wt');
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'side', wt);
    const first = await trackedFiles(wt);
    expect(await trackedFiles(wt)).toBe(first);
    write(join(wt, 'side.txt'), 's');
    git(wt, 'add', 'side.txt');
    expect((await trackedFiles(wt)).set.has('side.txt')).toBe(true);
  });
});

describe('files', () => {
  it('filters paths for quick open and pages them', async () => {
    const all = await api('files');
    expect(all.body.items.map((f: Json) => f.path)).toEqual(['docs/guide.md', 'README.md', 'src/app.txt']);
    const md = await api('files?q=MD&limit=1');
    expect(md.body).toEqual({ items: [{ path: 'docs/guide.md' }], total: 2, nextOffset: 1 });
  });
});

describe('file', () => {
  it('serves a tracked text file', async () => {
    const res = await api('file?path=src/app.txt');
    expect(res.body).toEqual({
      path: 'src/app.txt',
      size: 8,
      binary: false,
      tooLarge: false,
      content: 'one\ntwo\n',
    });
    expect((await api('file?path=./src//app.txt')).body.path).toBe('src/app.txt');
  });

  it('refuses untracked, ignored and missing files', async () => {
    commit({ '.gitignore': 'secret.txt\n' });
    write(join(fx.repo, 'secret.txt'), 'hidden');
    write(join(fx.repo, 'loose.txt'), 'untracked');
    expect((await api('file?path=secret.txt')).status).toBe(404);
    expect((await api('file?path=loose.txt')).status).toBe(404);
    expect((await api('file?path=src')).status).toBe(404);
    rmSync(join(fx.repo, 'README.md'));
    expect((await api('file?path=README.md')).status).toBe(404);
  });

  it('refuses a tracked symlink that points outside the repo', async () => {
    write(join(fx.tmp, 'outside.txt'), 'private');
    symlinkSync(join(fx.tmp, 'outside.txt'), join(fx.repo, 'leak.txt'));
    git(fx.repo, 'add', 'leak.txt');
    const res = await api('file?path=leak.txt');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('private');
  });

  it('refuses a FIFO without hanging', async () => {
    rmSync(join(fx.repo, 'src', 'app.txt'));
    execFileSync('mkfifo', [join(fx.repo, 'src', 'app.txt')]);
    expect((await api('file?path=src/app.txt')).status).toBe(403);
  });

  it('flags binary and too-large files without content', async () => {
    commit({
      'bin.dat': Buffer.from([0x50, 0x4b, 0x00, 0x01]),
      'big.txt': 'a'.repeat(CODE_FILE_MAX_BYTES + 1),
    });
    expect((await api('file?path=bin.dat')).body).toEqual({
      path: 'bin.dat',
      size: 4,
      binary: true,
      tooLarge: false,
      content: null,
    });
    expect((await api('file?path=big.txt')).body).toEqual({
      path: 'big.txt',
      size: CODE_FILE_MAX_BYTES + 1,
      binary: false,
      tooLarge: true,
      content: null,
    });
  });
});

describe('search', () => {
  it('finds fixed-string matches in tracked files only', async () => {
    write(join(fx.repo, 'loose.txt'), 'two');
    const res = await api('search?q=two');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{ path: 'src/app.txt', line: 2, text: 'two' }],
      total: 1,
      nextOffset: null,
      truncated: false,
    });
    commit({ 'regex.txt': 'a.c\nabc\n' });
    expect((await api('search?q=a.c')).body.items).toEqual([{ path: 'regex.txt', line: 1, text: 'a.c' }]);
  });

  it('ignores case unless case is set', async () => {
    commit({ 'greet.txt': 'Hello\nhello\n' });
    expect((await api('search?q=HELLO')).body.total).toBe(2);
    expect((await api('search?q=Hello&case=true')).body.items).toEqual([
      { path: 'greet.txt', line: 1, text: 'Hello' },
    ]);
  });

  it('reads an option-looking query as text', async () => {
    commit({ 'cli.txt': 'run with --output=x here\n' });
    const res = await api(`search?q=${enc('--output=x')}`);
    expect(res.body.items).toEqual([{ path: 'cli.txt', line: 1, text: 'run with --output=x here' }]);
    expect(existsSync(join(fx.repo, 'x'))).toBe(false);
  });

  it('stops at the match cap, pages the results and trims long lines', async () => {
    const lines = Array.from({ length: CODE_SEARCH_MAX_MATCHES + 20 }, (_, i) => `needle ${i}`);
    commit({ 'many.txt': `${lines.join('\n')}\n`, 'long.txt': `   needle ${'z'.repeat(1000)}\n` });
    const first = await api('search?q=needle&limit=200');
    expect(first.body.truncated).toBe(true);
    expect(first.body.total).toBe(CODE_SEARCH_MAX_MATCHES);
    expect(first.body.items).toHaveLength(200);
    expect(first.body.nextOffset).toBe(200);
    const long = first.body.items.find((m: Json) => m.path === 'long.txt');
    expect(long.text).toHaveLength(CODE_MATCH_LINE_MAX);
    expect(long.text.startsWith('needle z')).toBe(true);
    const last = await api('search?q=needle&limit=200&offset=400');
    expect(last.body.items).toHaveLength(100);
    expect(last.body.nextOffset).toBeNull();
  });
});

describe('resolve', () => {
  it('keeps only tracked files, from comma-separated and repeated refs', async () => {
    write(join(fx.repo, 'loose.txt'), 'untracked');
    const refs = [
      'src/app.txt:2,nope.ts:3',
      `${fx.repo}/docs/guide.md#L4`,
      'loose.txt',
      '/elsewhere/README.md',
      './README.md',
    ];
    const res = await api(`resolve?${refs.map((r) => `refs=${enc(r)}`).join('&')}`);
    expect(res.status).toBe(200);
    expect(res.body.refs).toEqual({
      'src/app.txt:2': { path: 'src/app.txt', line: 2 },
      'nope.ts:3': null,
      [`${fx.repo}/docs/guide.md#L4`]: { path: 'docs/guide.md', line: 4 },
      'loose.txt': null,
      '/elsewhere/README.md': null,
      './README.md': { path: 'README.md', line: null },
    });
  });
});
