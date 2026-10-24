import { open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { memoryStatus } from './memory.ts';
import type { AgentInfo, Project, Worktree } from './types.ts';

// Claude Code's subagent records are undocumented: every field is optional and bad files are skipped.
const META_RE = /^agent-([A-Za-z0-9_-]+)\.meta\.json$/;
const MAX_META = 64 * 1024;
const MAX_FIRST_LINE = 64 * 1024;
const BRIEF_RE = /\/[^\s"'`<>()[\]\\]*\/briefs\/[^\s"'`<>()[\]\\/]+\.md/g;

export interface AgentRecord {
  agentId: string;
  agentType: string | null;
  task: string | null;
  transcript: string;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const dirs = new Map<string, Promise<string | null>>();

/** Claude Code's transcripts folder for a repo: the parent of memory.py's `legacy_dir`. */
export function transcriptsDir(repo: string): Promise<string | null> {
  let dir = dirs.get(repo);
  if (!dir) {
    dir = memoryStatus(repo).then(
      (status) => dirname(status.legacy_dir),
      () => null,
    );
    dirs.set(repo, dir);
  }
  return dir;
}

async function readMeta(path: string): Promise<{ record: Record<string, unknown>; mtime: number } | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_META) return null;
    const record: unknown = JSON.parse(await readFile(path, 'utf8'));
    return record && typeof record === 'object'
      ? { record: record as Record<string, unknown>, mtime: info.mtimeMs }
      : null;
  } catch {
    return null;
  }
}

/** Agent records under `<dir>/<session>/subagents/`, keyed by worktree path; the newest record wins. */
export async function agentRecords(dir: string): Promise<Map<string, AgentRecord>> {
  const found = new Map<string, AgentRecord & { mtime: number }>();
  const sessions = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const session of sessions) {
    if (!session.isDirectory()) continue;
    const folder = join(dir, session.name, 'subagents');
    const files = await readdir(folder, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      files.map(async (file) => {
        const id = file.isFile() ? META_RE.exec(file.name)?.[1] : undefined;
        if (!id) return;
        const meta = await readMeta(join(folder, file.name));
        const worktree = text(meta?.record.worktreePath);
        if (!meta || !worktree) return;
        const key = resolve(worktree);
        if ((found.get(key)?.mtime ?? -1) >= meta.mtime) return;
        found.set(key, {
          agentId: id,
          agentType: text(meta.record.agentType),
          task: text(meta.record.description),
          transcript: join(folder, `agent-${id}.jsonl`),
          mtime: meta.mtime,
        });
      }),
    );
  }
  return new Map([...found].map(([key, { mtime: _, ...record }]) => [key, record]));
}

async function firstLine(path: string): Promise<string> {
  const handle = await open(path, 'r').catch(() => null);
  if (!handle) return '';
  try {
    if (!(await handle.stat()).isFile()) return '';
    const buffer = Buffer.alloc(MAX_FIRST_LINE);
    const { bytesRead } = await handle.read(buffer, 0, MAX_FIRST_LINE, 0);
    const chunk = buffer.subarray(0, bytesRead);
    const end = chunk.indexOf(0x0a);
    return chunk.subarray(0, end === -1 ? bytesRead : end).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** The prompt text of a transcript line, or the raw line when it isn't whole JSON (e.g. cut at the cap). */
function promptText(line: string): string {
  try {
    const content = (JSON.parse(line) as { message?: { content?: unknown } })?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content))
      return content.map((block) => text((block as { text?: unknown } | null)?.text) ?? '').join('\n');
    return '';
  } catch {
    return line;
  }
}

/** The first brief named in the transcript's first line that exists in the project's briefs folder. */
export async function briefPathFrom(transcript: string, memoryDir: string): Promise<string | null> {
  const briefs = await realpath(join(memoryDir, 'briefs')).catch(() => null);
  if (!briefs) return null;
  for (const candidate of promptText(await firstLine(transcript)).match(BRIEF_RE) ?? []) {
    const real = await realpath(candidate).catch(() => null);
    // Top level only, so the plan page can find it by file name.
    if (real && dirname(real) === briefs && (await stat(real)).isFile()) return real;
  }
  return null;
}

async function labeller(project: Project): Promise<(tree: Worktree) => Promise<AgentInfo>> {
  const dir = project.repo ? await transcriptsDir(project.repo) : null;
  const records = dir ? await agentRecords(dir) : new Map<string, AgentRecord>();
  return async (tree) => {
    const record = records.get(resolve(tree.path));
    return {
      task: record?.task ?? null,
      agentType: record?.agentType ?? null,
      agentId: record?.agentId ?? null,
      briefPath: record ? await briefPathFrom(record.transcript, project.memoryDir) : null,
    };
  };
}

/** Adds the task, type, id and brief of the agent that ran in each worktree; unknown fields stay null. */
export async function labelWorktrees<T extends Worktree>(
  project: Project,
  trees: T[],
): Promise<(T & AgentInfo)[]> {
  const label = await labeller(project);
  return Promise.all(trees.map(async (tree) => ({ ...tree, ...(await label(tree)) })));
}

export async function labelWorktree<T extends Worktree>(project: Project, tree: T): Promise<T & AgentInfo> {
  return { ...tree, ...(await (await labeller(project))(tree)) };
}
