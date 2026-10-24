import { type ChildProcess, spawn } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureServer,
  type PortStatus,
  parseOpenArgs,
  planFor,
  probePort,
  pruneBuilds,
  resolveUrl,
  stopServer,
  type Target,
} from './launcher.ts';
import {
  compareVersions,
  ensureToken,
  type HubPaths,
  hubPaths,
  pluginVersion,
  readState,
  readToken,
  writeState,
} from './state.ts';

const cwd = '/work/repo';

describe('parseOpenArgs', () => {
  it('opens a plan by path', () => {
    expect(parseOpenArgs(['plan', 'plans/a.md'], cwd)).toEqual({
      query: { kind: 'plan', path: '/work/repo/plans/a.md' },
      register: cwd,
      printUrl: false,
    });
  });

  it('opens a project by repo', () => {
    expect(parseOpenArgs(['project', '../other'], cwd)).toEqual({
      query: { kind: 'project', repo: '/work/other' },
      register: '/work/other',
      printUrl: false,
    });
  });

  it('falls back to the current folder for a bare project', () => {
    expect(parseOpenArgs(['project'], cwd)).toEqual({
      query: { kind: 'project', repo: cwd },
      register: cwd,
      printUrl: false,
    });
  });

  it('passes --base through for a worktree', () => {
    expect(parseOpenArgs(['worktree', '/wt/a', '--base', 'abc123'], cwd)).toEqual({
      query: { kind: 'worktree', path: '/wt/a', base: 'abc123' },
      register: '/wt/a',
      printUrl: false,
    });
  });

  it('accepts --print-url before or after the target', () => {
    const expected = {
      query: { kind: 'plan', path: '/work/repo/a.md' },
      register: cwd,
      printUrl: true,
    };
    expect(parseOpenArgs(['--print-url', 'plan', 'a.md'], cwd)).toEqual(expected);
    expect(parseOpenArgs(['plan', 'a.md', '--print-url'], cwd)).toEqual(expected);
  });

  it('rejects --base without a commit', () => {
    expect(() => parseOpenArgs(['worktree', '/wt/a', '--base'], cwd)).toThrow('--base needs a commit');
  });
});

describe('compareVersions', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBe(1);
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.2', '0.2.1')).toBe(-1);
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
  });
});

describe('planFor', () => {
  const hub = (version: string, build: string): PortStatus => ({
    kind: 'hub',
    hub: { pid: 1, version, build },
  });

  it('picks an action for each kind of port holder', () => {
    expect(planFor({ kind: 'free' }, 1, '0.2.0', 'b1')).toBe('start');
    expect(planFor(hub('0.2.0', 'b1'), 1, '0.2.0', 'b1')).toBe('reuse');
    expect(planFor(hub('0.2.0', 'b0'), 1, '0.2.0', 'b1')).toBe('replace');
    expect(planFor(hub('0.1.9', 'b1'), 1, '0.2.0', 'b1')).toBe('replace');
    expect(planFor(hub('0.3.0', 'b0'), 1, '0.2.0', 'b1')).toBe('reuse-newer');
  });

  it('refuses a port held by another program', () => {
    expect(() => planFor({ kind: 'foreign' }, 4000, '0.2.0', 'b1')).toThrow(
      'port 4000 is in use by another program; set TALK_FIRST_HUB_PORT',
    );
  });
});

const freePort = () =>
  new Promise<number>((done) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => done(port));
    });
  });

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

let home: string;
let paths: HubPaths;
let port: number;
let target: Target;
let children: ChildProcess[];

interface FakeOptions {
  /** Answers the hello challenge with a proof made from this token. */
  token?: string;
  /** Reports this pid instead of its own. */
  pid?: number;
}

// A stand-in hub in its own process, so the launcher can stop it by pid.
function fakeHub(on: number, body: Record<string, unknown>, opts: FakeOptions = {}): Promise<ChildProcess> {
  const script =
    "const { createHmac } = require('node:crypto');" +
    "require('node:http').createServer((req, res) => {" +
    "const nonce = new URL(req.url, 'http://x').searchParams.get('nonce') ?? '';" +
    'const out = { ...JSON.parse(process.env.FAKE_BODY), pid: Number(process.env.FAKE_PID || process.pid) };' +
    'if (process.env.FAKE_TOKEN) out.proof = createHmac("sha256", process.env.FAKE_TOKEN)' +
    '.update(process.env.FAKE_PORT + ":" + nonce).digest("base64url");' +
    "res.setHeader('content-type', 'application/json');" +
    'res.end(JSON.stringify(out));' +
    "}).listen(Number(process.env.FAKE_PORT), '127.0.0.1', () => console.log('ready'));";
  const child = spawn(process.execPath, ['-e', script], {
    env: {
      ...process.env,
      FAKE_BODY: JSON.stringify(body),
      FAKE_PORT: String(on),
      FAKE_TOKEN: opts.token ?? '',
      FAKE_PID: opts.pid ? String(opts.pid) : '',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  children.push(child);
  return new Promise((done, reject) => {
    child.stdout?.once('data', () => done(child));
    child.once('exit', () => reject(new Error('fake hub exited')));
  });
}

describe('ensureServer and stopServer', { timeout: 30_000 }, () => {
  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'hub-launcher-'));
    process.env.TALK_FIRST_HUB_HOME = home;
    paths = hubPaths();
    port = await freePort();
    children = [];
    const dist = join(paths.dist, '0123456789abcdef');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html>');
    target = { port, version: pluginVersion(), build: 'b1', dist };
  });

  afterEach(async () => {
    await stopServer(paths, port);
    for (const child of children) child.kill();
    rmSync(home, { recursive: true, force: true });
  });

  it('starts a hub on a free port with a token kept in its own file', async () => {
    const running = await ensureServer(paths, target);
    expect(running.hub).toMatchObject({ version: pluginVersion(), build: 'b1' });
    expect(alive(running.hub.pid)).toBe(true);
    expect(running.token).toBe(readToken(paths));
    expect(statSync(paths.token).mode & 0o777).toBe(0o600);
    expect(readState(paths)).toEqual({ pid: running.hub.pid, port, version: pluginVersion(), build: 'b1' });
  });

  it('reuses a hub with the same version and build', async () => {
    const first = await ensureServer(paths, target);
    const second = await ensureServer(paths, target);
    expect(second.hub.pid).toBe(first.hub.pid);
    expect(second.token).toBe(first.token);
  });

  it('replaces a hub with the same version and another build', async () => {
    const first = await ensureServer(paths, target);
    const second = await ensureServer(paths, { ...target, build: 'b2' });
    expect(second.hub.pid).not.toBe(first.hub.pid);
    expect(second.hub.build).toBe('b2');
    expect(alive(first.hub.pid)).toBe(false);
  });

  it('replaces an older hub', async () => {
    const old = await fakeHub(
      port,
      { ok: true, app: 'talk-first-hub', version: '0.0.1', build: 'b1' },
      { token: ensureToken(paths) },
    );
    writeState(paths, { pid: old.pid ?? 0, port, version: '0.0.1', build: 'b1' });
    const running = await ensureServer(paths, target);
    expect(running.hub.pid).not.toBe(old.pid);
    expect(running.hub.version).toBe(pluginVersion());
    expect(alive(old.pid ?? 0)).toBe(false);
  });

  it('reuses a newer hub and says so', async () => {
    const newer = await fakeHub(
      port,
      { ok: true, app: 'talk-first-hub', version: '999.0.0', build: 'b9' },
      { token: ensureToken(paths) },
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const running = await ensureServer(paths, target);
    expect(running.hub.pid).toBe(newer.pid);
    expect(alive(newer.pid ?? 0)).toBe(true);
    expect(log).toHaveBeenCalledWith('hub: a newer hub (999.0.0) is already running; using it.');
    log.mockRestore();
  });

  it('refuses a port held by another program', async () => {
    const other = createServer((_req, res) => res.writeHead(404).end('not here'));
    await new Promise<void>((done) => other.listen(port, '127.0.0.1', done));
    try {
      await expect(ensureServer(paths, target)).rejects.toThrow(
        `port ${port} is in use by another program; set TALK_FIRST_HUB_PORT`,
      );
    } finally {
      other.close();
    }
  });

  it('treats a listener that cannot prove the token as foreign and never sends it the token', async () => {
    const seen: string[] = [];
    const impostor = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, app: 'talk-first-hub', pid: 1, version: '999.0.0', build: 'b9' }));
    });
    await new Promise<void>((done) => impostor.listen(port, '127.0.0.1', done));
    try {
      const token = ensureToken(paths);
      expect(await probePort(port, token)).toEqual({ kind: 'foreign' });
      await expect(ensureServer(paths, target)).rejects.toThrow('in use by another program');
      expect(await stopServer(paths, port)).toBe(false);
      expect(seen.length).toBeGreaterThan(0);
      for (const url of seen) {
        expect(url).not.toContain('token');
        expect(url).not.toContain(token);
      }
    } finally {
      impostor.close();
    }
  });

  it('never kills a pid that state.json does not list', async () => {
    const victim = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    children.push(victim);
    const victimPid = victim.pid ?? 0;
    const holder = await fakeHub(
      port,
      { ok: true, app: 'talk-first-hub', version: '0.0.1', build: 'b0' },
      { token: ensureToken(paths), pid: victimPid },
    );
    writeState(paths, { pid: holder.pid ?? 0, port, version: '0.0.1', build: 'b0' });
    await expect(ensureServer(paths, target)).rejects.toThrow('state.json');
    await expect(ensureServer(paths, target, true)).rejects.toThrow('state.json');
    expect(await stopServer(paths, port)).toBe(false);
    expect(alive(victimPid)).toBe(true);
  });

  it('stops a pre-change hub recorded in state.json without a version', async () => {
    const legacyPort = await freePort();
    const legacy = await fakeHub(legacyPort, { ok: true });
    writeFileSync(
      paths.state,
      JSON.stringify({ pid: legacy.pid, port: legacyPort, token: 'legacy-token', build: 'old' }),
    );
    const running = await ensureServer(paths, target);
    expect(alive(legacy.pid ?? 0)).toBe(false);
    expect(readState(paths)).toEqual({ pid: running.hub.pid, port, version: pluginVersion(), build: 'b1' });
  });

  it('keeps the token across restart, and across stop then start', async () => {
    const first = await ensureServer(paths, target);
    const restarted = await ensureServer(paths, target, true);
    expect(restarted.hub.pid).not.toBe(first.hub.pid);
    expect(restarted.token).toBe(first.token);

    expect(await stopServer(paths, port)).toBe(true);
    expect(await probePort(port, first.token)).toEqual({ kind: 'free' });
    expect(readToken(paths)).toBe(first.token);
    expect((await ensureServer(paths, target)).token).toBe(first.token);
  });
});

describe('resolveUrl', () => {
  it('keeps the page on the hub origin and rejects URLs for another host', async () => {
    const reply = { url: '' };
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply));
    });
    const at = await freePort();
    await new Promise<void>((done) => server.listen(at, '127.0.0.1', done));
    const running = { port: at, token: 'tok', hub: { pid: 1, version: '0.2.0', build: 'b1' } };
    try {
      reply.url = '/p/demo/plans?x=1';
      expect(await resolveUrl(running, { kind: 'project' })).toBe(
        `http://127.0.0.1:${at}/p/demo/plans?x=1&token=tok`,
      );
      reply.url = '@attacker.example/';
      expect(new URL(await resolveUrl(running, { kind: 'project' })).host).toBe(`127.0.0.1:${at}`);
      for (const url of ['//attacker.example/x', 'http://attacker.example/', `http://127.0.0.1:${at + 1}/`]) {
        reply.url = url;
        await expect(resolveUrl(running, { kind: 'project' }), url).rejects.toThrow('another host');
      }
    } finally {
      server.close();
    }
  });
});

describe('ensureToken', () => {
  it('makes the token once and then reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-token-'));
    process.env.TALK_FIRST_HUB_HOME = dir;
    try {
      const token = ensureToken(hubPaths());
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(ensureToken(hubPaths())).toBe(token);
      expect(readFileSync(join(dir, 'token'), 'utf8').trim()).toBe(token);
      chmodSync(join(dir, 'token'), 0o644);
      expect(ensureToken(hubPaths())).toBe(token);
      expect(statSync(join(dir, 'token')).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('pruneBuilds', () => {
  it('keeps the two most recently used builds and any named one, and clears the old layout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-prune-'));
    process.env.TALK_FIRST_HUB_HOME = dir;
    const p = hubPaths();
    try {
      const names = ['000000000000000a', '000000000000000b', '000000000000000c', '000000000000000d'];
      names.forEach((name, i) => {
        mkdirSync(join(p.dist, name), { recursive: true });
        const when = new Date(Date.UTC(2026, 0, i + 1));
        utimesSync(join(p.dist, name), when, when);
      });
      mkdirSync(join(p.dist, 'assets'));
      mkdirSync(join(p.dist, 'dev'));
      writeFileSync(join(p.dist, 'index.html'), '');
      writeFileSync(join(p.dist, '.build-hash'), 'old\n');

      pruneBuilds(p, ['000000000000000a']);

      const left = (name: string) => {
        try {
          statSync(join(p.dist, name));
          return true;
        } catch {
          return false;
        }
      };
      expect(
        ['000000000000000a', '000000000000000b', '000000000000000c', '000000000000000d'].map(left),
      ).toEqual([true, false, true, true]);
      expect(['assets', 'index.html', '.build-hash', 'dev'].map(left)).toEqual([false, false, false, true]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
