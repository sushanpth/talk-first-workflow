import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { transcriptsDir } from './agents.ts';
import { memoryProjects, memoryStatus } from './memory.ts';
import { ensureHome, type HubPaths } from './state.ts';
import type { Project } from './types.ts';

/** Repos the hub was opened for, kept so projects without a memory folder under the root still show. */
export function registeredRepos(paths: HubPaths): string[] {
  try {
    const data = JSON.parse(readFileSync(paths.projects, 'utf8')) as { repos?: unknown };
    return Array.isArray(data.repos) ? data.repos.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export function registerRepo(paths: HubPaths, repo: string): void {
  const repos = registeredRepos(paths);
  const full = resolve(repo);
  if (repos.includes(full)) return;
  ensureHome(paths);
  writeFileSync(paths.projects, `${JSON.stringify({ repos: [...repos, full] }, null, 2)}\n`);
}

async function existingDir(path: string): Promise<string | null> {
  const real = await realpath(path).catch(() => null);
  return real && (await stat(real)).isDirectory() ? real : null;
}

async function loadProjects(paths: HubPaths): Promise<Project[]> {
  const projects: Project[] = [];
  for (const entry of await memoryProjects()) {
    projects.push({
      id: entry.name,
      name: entry.name,
      repo: await existingDir(entry.repo),
      memoryDir: entry.memory_dir,
      noteCount: entry.note_count,
      briefCount: entry.brief_count,
    });
  }
  for (const repo of registeredRepos(paths)) {
    if (!(await existingDir(repo))) continue;
    const status = await memoryStatus(repo).catch(() => null);
    if (!status?.is_git) continue;
    const root = await existingDir(status.repo_root);
    const known = projects.find((p) => p.memoryDir === status.memory_dir || (root && p.repo === root));
    if (known) {
      known.repo ??= root;
      continue;
    }
    let id = basename(status.repo_root);
    for (let n = 2; projects.some((p) => p.id === id); n += 1) id = `${basename(status.repo_root)}-${n}`;
    projects.push({
      id,
      name: basename(status.repo_root),
      repo: root,
      memoryDir: status.memory_dir,
      noteCount: status.note_count,
      briefCount: 0,
    });
  }
  return projects;
}

/** A folder the hub may read from, per project; add an entry to widen access. The hub never writes to one. */
type RootSource = (project: Project) => string | null | Promise<string | null>;

const ROOT_SOURCES: RootSource[] = [
  (p) => p.repo,
  (p) => p.memoryDir,
  // Claude Code's session and agent transcripts.
  (p) => (p.repo ? transcriptsDir(p.repo) : null),
];

/** Project list, cached briefly; a change to the registry file invalidates it at once. */
export class ProjectStore {
  private cache: { at: number; key: string; projects: Promise<Project[]> } | null = null;
  private readonly paths: HubPaths;
  private readonly ttl: number;

  constructor(paths: HubPaths, ttl = 3000) {
    this.paths = paths;
    this.ttl = ttl;
  }

  list(): Promise<Project[]> {
    let key = '';
    try {
      key = String(statSync(this.paths.projects).mtimeMs);
    } catch {}
    const now = Date.now();
    if (!this.cache || this.cache.key !== key || now - this.cache.at > this.ttl) {
      const projects = loadProjects(this.paths);
      this.cache = { at: now, key, projects };
      projects.catch(() => {
        this.cache = null;
      });
    }
    return this.cache.projects;
  }

  async get(id: string): Promise<Project | undefined> {
    return (await this.list()).find((p) => p.id === id);
  }

  /** Every folder the hub may read from, from `ROOT_SOURCES`. */
  async roots(): Promise<string[]> {
    const projects = await this.list();
    const found = await Promise.all(projects.flatMap((p) => ROOT_SOURCES.map((source) => source(p))));
    return found.filter((root): root is string => root !== null);
  }
}
