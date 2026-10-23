import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { memoryStatus } from './memory.ts';
import { registerRepo } from './projects.ts';
import { createToken } from './security.ts';
import { ensureHome, HUB_ROOT, type HubPaths, hubPaths, readState, type ServerState } from './state.ts';

class CliError extends Error {}

const USAGE =
  'usage: node hub/cli.ts open [plan <path> | note <path> | doc <repo> <path> | worktree <path> [--base <sha>] | project <repo>] [--print-url]\n' +
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

async function ensureBuilt(paths: HubPaths, hash: string): Promise<void> {
  const stamp = join(paths.dist, '.build-hash');
  if (
    existsSync(join(paths.dist, 'index.html')) &&
    existsSync(stamp) &&
    readFileSync(stamp, 'utf8').trim() === hash
  ) {
    return;
  }
  console.error('hub: installing and building (first run or the hub changed)...');
  ensureHome(paths);
  await pnpm(['install', '--frozen-lockfile', '--config.confirmModulesPurge=false']);
  const tmp = `${paths.dist}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  await pnpm(['exec', 'vite', 'build', '--config', 'web/vite.config.ts', '--outDir', tmp, '--emptyOutDir']);
  writeFileSync(join(tmp, '.build-hash'), `${hash}\n`);
  rmSync(paths.dist, { recursive: true, force: true });
  renameSync(tmp, paths.dist);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True when the recorded server answers as itself, so a reused pid is never mistaken for it. */
async function serverAlive(state: ServerState): Promise<boolean> {
  if (!pidAlive(state.pid)) return false;
  try {
    const res = await fetch(
      `http://127.0.0.1:${state.port}/api/health?token=${encodeURIComponent(state.token)}`,
      {
        signal: AbortSignal.timeout(1500),
      },
    );
    return res.ok && ((await res.json()) as { pid?: number }).pid === state.pid;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function stopServer(paths: HubPaths): Promise<boolean> {
  const state = readState(paths);
  if (!state || !(await serverAlive(state))) {
    rmSync(paths.state, { force: true });
    return false;
  }
  process.kill(state.pid, 'SIGTERM');
  for (let i = 0; i < 50 && pidAlive(state.pid); i += 1) await sleep(100);
  rmSync(paths.state, { force: true });
  return true;
}

async function ensureServer(paths: HubPaths, build: string): Promise<ServerState> {
  const state = readState(paths);
  if (state && (await serverAlive(state))) {
    if (state.build === build) return state;
    await stopServer(paths);
  }
  ensureHome(paths);
  const log = openSync(paths.log, 'a');
  const child = spawn(process.execPath, [join(HUB_ROOT, 'server', 'main.ts')], {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, TALK_FIRST_HUB_TOKEN: createToken(), TALK_FIRST_HUB_BUILD: build },
  });
  closeSync(log);
  child.unref();
  for (let i = 0; i < 150; i += 1) {
    await sleep(100);
    const started = readState(paths);
    if (started && started.pid === child.pid && (await serverAlive(started))) return started;
    if (child.exitCode !== null) break;
  }
  throw new CliError(`the server did not start; see ${paths.log}`);
}

async function register(paths: HubPaths, path: string): Promise<void> {
  const status = await memoryStatus(path).catch(() => null);
  if (status?.is_git) registerRepo(paths, status.repo_root);
}

async function resolveUrl(state: ServerState, query: Record<string, string>): Promise<string> {
  const params = new URLSearchParams({ ...query, token: state.token });
  const res = await fetch(`http://127.0.0.1:${state.port}/api/resolve?${params}`);
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new CliError(body.error ?? `resolve failed (${res.status})`);
  const sep = body.url.includes('?') ? '&' : '?';
  return `http://127.0.0.1:${state.port}${body.url}${sep}token=${encodeURIComponent(state.token)}`;
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

interface OpenRequest {
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

async function open(args: string[]): Promise<number> {
  const printUrl = args.includes('--print-url');
  const baseAt = args.indexOf('--base');
  const base = baseAt >= 0 ? args[baseAt + 1] : undefined;
  if (baseAt >= 0 && !base) throw new CliError(`--base needs a commit.\n${USAGE}`);
  const positional = args.filter((a, i) => a !== '--print-url' && i !== baseAt && i !== baseAt + 1);
  const request = parseOpen(positional, process.cwd());
  if (base) request.query.base = base;

  const paths = hubPaths();
  const build = sourceHash();
  await ensureBuilt(paths, build);
  await register(paths, request.register);
  const state = await ensureServer(paths, build);
  const url = await resolveUrl(state, request.query);
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
    if (command === 'stop') {
      console.error((await stopServer(hubPaths())) ? 'hub: stopped.' : 'hub: not running.');
      return 0;
    }
    console.error(USAGE);
    return command === undefined || command === '--help' ? 0 : 2;
  } catch (err) {
    console.error(`hub: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
