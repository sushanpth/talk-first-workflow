import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  type Dirent,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { memoryStatus } from './memory.ts';
import { registerRepo } from './projects.ts';
import {
  buildDir,
  compareVersions,
  ensureHome,
  ensureToken,
  HUB_APP,
  HUB_ROOT,
  type HubPaths,
  hubPaths,
  hubPort,
  pluginVersion,
  readState,
  readToken,
} from './state.ts';

class CliError extends Error {}

const USAGE =
  'usage: node hub/cli.ts open [plan <path> | note <path> | doc <repo> <path> | worktree <path> [--base <sha>] | project <repo>] [--print-url]\n' +
  '       node hub/cli.ts restart\n' +
  '       node hub/cli.ts stop';

/** Hash of the hub sources; a change triggers a reinstall, rebuild and server restart. */
export function sourceHash(root = HUB_ROOT): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) hash.update(relative(root, full)).update('\0').update(readFileSync(full));
    }
  };
  walk(root);
  return hash.digest('hex').slice(0, 16);
}

const BUILD_NAME = /^[0-9a-f]{16}$/;

function pnpm(args: string[]): Promise<void> {
  return new Promise((done, reject) => {
    // stdout goes to stderr so `--print-url` output stays a single line.
    const child = spawn('pnpm', args, { cwd: HUB_ROOT, stdio: ['ignore', 2, 2] });
    child.on('error', (err: NodeJS.ErrnoException) =>
      reject(
        new CliError(
          err.code === 'ENOENT'
            ? 'pnpm is not installed; install it (https://pnpm.io/installation) and retry.'
            : err.message,
        ),
      ),
    );
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new CliError(`pnpm ${args[0]} failed (exit ${code}).`)),
    );
  });
}

function isBuilt(dir: string, hash: string): boolean {
  const stamp = join(dir, '.build-hash');
  return (
    existsSync(join(dir, 'index.html')) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === hash
  );
}

/** Builds into `dist/<hash>/` unless that build exists; returns its folder. */
async function ensureBuilt(paths: HubPaths, hash: string): Promise<string> {
  const dir = buildDir(paths, hash);
  if (isBuilt(dir, hash)) {
    // Marks it as recently used, so pruning keeps the builds still in use.
    const now = new Date();
    utimesSync(dir, now, now);
    return dir;
  }
  console.error('hub: installing and building (first run or the hub changed)...');
  ensureHome(paths);
  await pnpm(['install', '--frozen-lockfile', '--config.confirmModulesPurge=false']);
  // Per-process name: two launchers may build the same hash at once.
  const tmp = join(paths.dist, `.tmp-${hash}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  await pnpm([
    'exec',
    'vite',
    'build',
    '--config',
    'web/vite.config.ts',
    '--outDir',
    tmp,
    '--emptyOutDir',
    '--logLevel',
    'warn',
  ]);
  writeFileSync(join(tmp, '.build-hash'), `${hash}\n`);
  rmSync(dir, { recursive: true, force: true });
  try {
    renameSync(tmp, dir);
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    if (!isBuilt(dir, hash)) throw err;
  }
  return dir;
}

/** Deletes all builds but the two most recently used, and never one named in `keep`. */
export function pruneBuilds(paths: HubPaths, keep: string[] = []): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(paths.dist, { withFileTypes: true });
  } catch {
    return;
  }
  const builds = entries
    .filter((e) => e.isDirectory() && BUILD_NAME.test(e.name))
    .map((e) => ({ name: e.name, used: statSync(join(paths.dist, e.name)).mtimeMs }))
    .sort((a, b) => b.used - a.used);
  for (const { name } of builds.slice(2)) {
    if (!keep.includes(name)) rmSync(join(paths.dist, name), { recursive: true, force: true });
  }
  // A pre-change hub built straight into dist/; its stamp there marks that layout.
  if (entries.some((e) => e.isFile() && e.name === '.build-hash')) {
    for (const e of entries) {
      if (BUILD_NAME.test(e.name) || e.name === 'dev' || e.name.startsWith('.tmp-')) continue;
      rmSync(join(paths.dist, e.name), { recursive: true, force: true });
    }
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function health(port: number, token: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/health?token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(1500),
  });
}

export interface HubInfo {
  pid: number;
  version: string;
  build: string;
}

export type PortStatus = { kind: 'free' } | { kind: 'hub'; hub: HubInfo } | { kind: 'foreign' };

/** What holds the port: nothing, one of our hubs, or another program. */
export async function probePort(port: number, token: string): Promise<PortStatus> {
  let res: Response;
  try {
    res = await health(port, token);
  } catch (err) {
    const code = ((err as Error).cause as NodeJS.ErrnoException | undefined)?.code;
    return code === 'ECONNREFUSED' ? { kind: 'free' } : { kind: 'foreign' };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && body?.app === HUB_APP && typeof body.pid === 'number') {
    return {
      kind: 'hub',
      hub: { pid: body.pid, version: String(body.version ?? ''), build: String(body.build ?? '') },
    };
  }
  return { kind: 'foreign' };
}

export type Plan = 'start' | 'reuse' | 'reuse-newer' | 'replace';

/** Newest version wins; for the same version a different build means a restart. */
export function planFor(status: PortStatus, port: number, version: string, build: string): Plan {
  if (status.kind === 'free') return 'start';
  if (status.kind === 'foreign') {
    throw new CliError(`port ${port} is in use by another program; set TALK_FIRST_HUB_PORT`);
  }
  const order = compareVersions(status.hub.version, version);
  if (order > 0) return 'reuse-newer';
  return order === 0 && status.hub.build === build ? 'reuse' : 'replace';
}

async function killHub(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 50 && pidAlive(pid); i += 1) await sleep(100);
}

/** A hub from before the fixed port: random port, token in state.json, no version. It counts as older. */
async function stopLegacy(paths: HubPaths): Promise<boolean> {
  const state = readState(paths);
  if (!state || state.version !== undefined) return false;
  let stopped = false;
  if (state.token && pidAlive(state.pid)) {
    // The pid must answer on its port, so a reused pid is never killed.
    const pid = await health(state.port, state.token)
      .then(async (res) => (res.ok ? ((await res.json()) as { pid?: unknown }).pid : null))
      .catch(() => null);
    if (pid === state.pid) {
      await killHub(state.pid);
      stopped = true;
    }
  }
  rmSync(paths.state, { force: true });
  return stopped;
}

export interface Target {
  port: number;
  version: string;
  build: string;
  /** The build folder a newly started server serves. */
  dist: string;
}

export interface Running {
  port: number;
  token: string;
  hub: HubInfo;
}

async function startServer(paths: HubPaths, target: Target, token: string): Promise<Running> {
  ensureHome(paths);
  const log = openSync(paths.log, 'a');
  const child = spawn(process.execPath, [join(HUB_ROOT, 'server', 'main.ts')], {
    detached: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      TALK_FIRST_HUB_PORT: String(target.port),
      TALK_FIRST_HUB_BUILD: target.build,
      TALK_FIRST_HUB_DIST: target.dist,
    },
  });
  closeSync(log);
  child.unref();
  for (let i = 0; i < 150; i += 1) {
    await sleep(100);
    const status = await probePort(target.port, token);
    if (status.kind === 'hub' && status.hub.pid === child.pid) {
      return { port: target.port, token, hub: status.hub };
    }
    if (child.exitCode !== null) {
      // Another launcher may have won the race for the port with a hub we can use.
      if (status.kind === 'hub' && planFor(status, target.port, target.version, target.build) !== 'replace') {
        return { port: target.port, token, hub: status.hub };
      }
      break;
    }
  }
  throw new CliError(`the server did not start; see ${paths.log}`);
}

/** Reuses, replaces or starts the hub on the target port; `restart` always replaces ours. */
export async function ensureServer(paths: HubPaths, target: Target, restart = false): Promise<Running> {
  await stopLegacy(paths);
  const token = ensureToken(paths);
  const status = await probePort(target.port, token);
  const plan = planFor(status, target.port, target.version, target.build);
  if (status.kind === 'hub') {
    if (!restart && plan === 'reuse') return { port: target.port, token, hub: status.hub };
    if (!restart && plan === 'reuse-newer') {
      console.error(`hub: a newer hub (${status.hub.version}) is already running; using it.`);
      return { port: target.port, token, hub: status.hub };
    }
    await killHub(status.hub.pid);
  }
  return startServer(paths, target, token);
}

/** Stops our hub on `port` and on the port in state.json, and any pre-change hub. */
export async function stopServer(paths: HubPaths, port: number): Promise<boolean> {
  let stopped = await stopLegacy(paths);
  const token = readToken(paths);
  if (!token) return stopped;
  for (const p of new Set([port, readState(paths)?.port ?? port])) {
    const status = await probePort(p, token);
    if (status.kind !== 'hub') continue;
    await killHub(status.hub.pid);
    stopped = true;
  }
  return stopped;
}

async function register(paths: HubPaths, path: string): Promise<void> {
  const status = await memoryStatus(path).catch(() => null);
  if (status?.is_git) registerRepo(paths, status.repo_root);
}

async function resolveUrl(running: Running, query: Record<string, string>): Promise<string> {
  const { port, token } = running;
  const params = new URLSearchParams({ ...query, token });
  const res = await fetch(`http://127.0.0.1:${port}/api/resolve?${params}`);
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new CliError(body.error ?? `resolve failed (${res.status})`);
  const sep = body.url.includes('?') ? '&' : '?';
  return `http://127.0.0.1:${port}${body.url}${sep}token=${encodeURIComponent(token)}`;
}

function openBrowser(url: string): Promise<boolean> {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (!opener) return Promise.resolve(false);
  return new Promise((done) => {
    const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => done(false));
    child.on('spawn', () => {
      child.unref();
      done(true);
    });
  });
}

export interface OpenRequest {
  query: Record<string, string>;
  register: string;
}

function parseOpen(args: string[], cwd: string): OpenRequest {
  const [kind = 'project', ...rest] = args;
  const abs = (p: string | undefined, what: string): string => {
    if (!p) throw new CliError(`missing ${what}.\n${USAGE}`);
    return resolve(cwd, p);
  };
  switch (kind) {
    case 'project': {
      const repo = rest[0] ? abs(rest[0], 'repo') : cwd;
      return { query: { kind, repo }, register: repo };
    }
    case 'plan':
    case 'note':
      return { query: { kind, path: abs(rest[0], `${kind} path`) }, register: cwd };
    case 'doc': {
      const repo = abs(rest[0], 'repo');
      return { query: { kind, repo, path: abs(rest[1], 'doc path') }, register: repo };
    }
    case 'worktree': {
      const path = abs(rest[0], 'worktree path');
      return { query: { kind, path }, register: path };
    }
    default:
      throw new CliError(`unknown target '${kind}'.\n${USAGE}`);
  }
}

/** Parses the arguments after `open`; kept free of side effects so tests can call it. */
export function parseOpenArgs(args: string[], cwd: string): OpenRequest & { printUrl: boolean } {
  const printUrl = args.includes('--print-url');
  const baseAt = args.indexOf('--base');
  const base = baseAt >= 0 ? args[baseAt + 1] : undefined;
  if (baseAt >= 0 && !base) throw new CliError(`--base needs a commit.\n${USAGE}`);
  const positional = args.filter(
    (a, i) => a !== '--print-url' && (baseAt < 0 || (i !== baseAt && i !== baseAt + 1)),
  );
  const request = parseOpen(positional, cwd);
  if (base) request.query.base = base;
  return { ...request, printUrl };
}

/** Builds this plugin's hub if needed and starts or reuses a server for it. */
async function launch(paths: HubPaths, restart: boolean): Promise<Running> {
  const port = hubPort();
  const build = sourceHash();
  const dist = await ensureBuilt(paths, build);
  const running = await ensureServer(paths, { port, version: pluginVersion(), build, dist }, restart);
  pruneBuilds(paths, [build, running.hub.build]);
  return running;
}

async function open(args: string[]): Promise<number> {
  const { printUrl, ...request } = parseOpenArgs(args, process.cwd());
  const paths = hubPaths();
  await register(paths, request.register);
  const running = await launch(paths, false);
  const url = await resolveUrl(running, request.query);
  if (printUrl || !(await openBrowser(url))) {
    console.log(url);
  } else {
    console.error(`hub: opened ${url.replace(/token=[^&]+/, 'token=...')}`);
  }
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  try {
    const [command, ...args] = argv;
    if (command === 'open') return await open(args);
    if (command === 'restart') {
      const { port, hub } = await launch(hubPaths(), true);
      console.error(`hub: restarted ${hub.version} on http://127.0.0.1:${port}`);
      return 0;
    }
    if (command === 'stop') {
      console.error((await stopServer(hubPaths(), hubPort())) ? 'hub: stopped.' : 'hub: not running.');
      return 0;
    }
    console.error(USAGE);
    return command === undefined || command === '--help' ? 0 : 2;
  } catch (err) {
    console.error(`hub: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
