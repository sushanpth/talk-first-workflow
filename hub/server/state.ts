import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const PLUGIN_ROOT = resolve(import.meta.dirname, '..', '..');
export const HUB_ROOT = join(PLUGIN_ROOT, 'hub');
export const MEMORY_PY = join(PLUGIN_ROOT, 'scripts', 'memory.py');

export interface HubPaths {
  home: string;
  state: string;
  projects: string;
  dist: string;
  log: string;
}

export function hubPaths(): HubPaths {
  // The env override keeps tests away from the real cache.
  const home = process.env.TALK_FIRST_HUB_HOME ?? join(homedir(), '.cache', 'talk-first-workflow', 'hub');
  return {
    home,
    state: join(home, 'state.json'),
    projects: join(home, 'projects.json'),
    dist: join(home, 'dist'),
    log: join(home, 'server.log'),
  };
}

export interface ServerState {
  pid: number;
  port: number;
  token: string;
  build: string;
}

export function ensureHome(paths: HubPaths): void {
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
}

export function readState(paths: HubPaths): ServerState | null {
  try {
    const data = JSON.parse(readFileSync(paths.state, 'utf8')) as Partial<ServerState>;
    if (typeof data.pid === 'number' && typeof data.port === 'number' && typeof data.token === 'string') {
      return { pid: data.pid, port: data.port, token: data.token, build: data.build ?? '' };
    }
  } catch {}
  return null;
}

export function writeState(paths: HubPaths, state: ServerState): void {
  ensureHome(paths);
  // The file holds the token, so only the user may read it.
  writeFileSync(paths.state, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

export function clearState(paths: HubPaths, pid: number): void {
  if (readState(paths)?.pid === pid) rmSync(paths.state, { force: true });
}
