import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createToken } from './security.ts';

export const PLUGIN_ROOT = resolve(import.meta.dirname, '..', '..');
export const HUB_ROOT = join(PLUGIN_ROOT, 'hub');
export const MEMORY_PY = join(PLUGIN_ROOT, 'scripts', 'memory.py');
export const HUB_APP = 'talk-first-hub';
export const DEFAULT_PORT = 47321;

export interface HubPaths {
  home: string;
  state: string;
  token: string;
  projects: string;
  /** Holds one folder per build, named by its source hash. */
  dist: string;
  log: string;
}

export function hubPaths(): HubPaths {
  // The env override keeps tests away from the real cache.
  const home = process.env.TALK_FIRST_HUB_HOME ?? join(homedir(), '.cache', 'talk-first-workflow', 'hub');
  return {
    home,
    state: join(home, 'state.json'),
    token: join(home, 'token'),
    projects: join(home, 'projects.json'),
    dist: join(home, 'dist'),
    log: join(home, 'server.log'),
  };
}

export function buildDir(paths: HubPaths, build: string): string {
  return join(paths.dist, build);
}

export function hubPort(): number {
  const raw = process.env.TALK_FIRST_HUB_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`TALK_FIRST_HUB_PORT must be a port number from 1 to 65535 (got '${raw}').`);
  }
  return port;
}

/** This plugin's version from its manifest; the newest running hub wins over older ones. */
export function pluginVersion(root = PLUGIN_ROOT): string {
  try {
    const data = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')) as {
      version?: unknown;
    };
    if (typeof data.version === 'string') return data.version;
  } catch {}
  return '0.0.0';
}

/** Numeric compare of dotted versions; a pre-release suffix is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (v.split('-')[0] ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export function ensureHome(paths: HubPaths): void {
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
}

export function readToken(paths: HubPaths): string | null {
  try {
    const token = readFileSync(paths.token, 'utf8').trim();
    return token.length >= 32 ? token : null;
  } catch {
    return null;
  }
}

/** The token is made once and kept, so the cookie and open tabs survive server restarts. */
export function ensureToken(paths: HubPaths): string {
  const existing = readToken(paths);
  if (existing) return existing;
  ensureHome(paths);
  const token = createToken();
  try {
    // Exclusive create: two launchers starting at once must agree on one token.
    writeFileSync(paths.token, `${token}\n`, { mode: 0o600, flag: 'wx' });
    return token;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  const raced = readToken(paths);
  if (raced) return raced;
  // An existing but unusable file: replace it.
  writeFileSync(paths.token, `${token}\n`, { mode: 0o600 });
  return token;
}

export interface ServerState {
  pid: number;
  port: number;
  build: string;
  /** Missing in state written by a hub from before the fixed port. */
  version?: string;
  /** Only a pre-change hub kept its token here. */
  token?: string;
}

export function readState(paths: HubPaths): ServerState | null {
  try {
    const data = JSON.parse(readFileSync(paths.state, 'utf8')) as Partial<ServerState>;
    if (typeof data.pid === 'number' && typeof data.port === 'number') {
      const state: ServerState = { pid: data.pid, port: data.port, build: data.build ?? '' };
      if (typeof data.version === 'string') state.version = data.version;
      if (typeof data.token === 'string') state.token = data.token;
      return state;
    }
  } catch {}
  return null;
}

export function writeState(paths: HubPaths, state: ServerState): void {
  ensureHome(paths);
  writeFileSync(paths.state, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

export function clearState(paths: HubPaths, pid: number): void {
  if (readState(paths)?.pid === pid) rmSync(paths.state, { force: true });
}
