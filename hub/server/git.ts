import { constants } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { realInside } from './paths.ts';
import { run, runBuffer } from './run.ts';
import type { ChangedFile, Worktree } from './types.ts';

const git = (cwd: string, ...args: string[]) => run('git', args, cwd);

export interface WorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
}

/** Parses `git worktree list --porcelain -z`: NUL-terminated lines, an empty line between entries. */
export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of output.split('\0')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: '', branch: null, bare: false };
      entries.push(current);
    } else if (!current) {
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    }
  }
  return entries;
}

/** Parses `git diff --name-status -z`; renames and copies carry the old path first. */
export function parseNameStatus(output: string): ChangedFile[] {
  const tokens = output.split('\0');
  // Every field ends in NUL, so the last token is always the empty remainder.
  if (tokens.at(-1) === '') tokens.pop();
  const files: ChangedFile[] = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i] ?? '';
    if (!status) {
      i += 1;
      continue;
    }
    const letter = status[0] ?? '';
    if (letter === 'R' || letter === 'C') {
      const oldPath = tokens[i + 1];
      const path = tokens[i + 2];
      if (oldPath === undefined || path === undefined) break;
      files.push({ status: letter, path, oldPath });
      i += 3;
    } else {
      const path = tokens[i + 1];
      if (path === undefined) break;
      files.push({ status: letter, path });
      i += 2;
    }
  }
  return files;
}

export async function worktreeEntries(repo: string): Promise<WorktreeEntry[]> {
  return parseWorktreeList(await git(repo, 'worktree', 'list', '--porcelain', '-z'));
}

/** Linked worktrees, named by folder; the main checkout is left out. */
export async function listWorktrees(repo: string): Promise<Worktree[]> {
  const entries = await worktreeEntries(repo);
  return entries
    .slice(1)
    .filter((entry) => !entry.bare)
    .map((entry) => ({
      name: basename(entry.path),
      path: entry.path,
      branch: entry.branch,
      head: entry.head,
    }));
}

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]*$/;

/** Resolves a user-supplied ref to a commit sha, refusing anything that could read as an option. */
export async function resolveCommit(cwd: string, ref: string): Promise<string | null> {
  if (!REF_RE.test(ref) || ref.length > 200) return null;
  try {
    return (await git(cwd, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`)).trim();
  } catch {
    return null;
  }
}

/** Merge-base of the worktree's HEAD with the main checkout's current branch. */
export async function defaultBase(repo: string, worktreePath: string): Promise<string> {
  const main = (await worktreeEntries(repo))[0];
  const target = main?.branch ? `refs/heads/${main.branch}` : (main?.head ?? 'HEAD');
  return (await git(worktreePath, 'merge-base', '--end-of-options', target, 'HEAD')).trim();
}

/** Committed and uncommitted changes against `base`, plus untracked files. */
export async function changedFiles(worktreePath: string, base: string): Promise<ChangedFile[]> {
  const diff = await git(worktreePath, 'diff', '--name-status', '-M', '-z', base, '--');
  const untracked = await git(worktreePath, 'ls-files', '--others', '--exclude-standard', '-z');
  const files = parseNameStatus(diff);
  for (const path of untracked.split('\0')) {
    if (path) files.push({ status: '?', path });
  }
  return files;
}

const MAX_FILE = 4 * 1024 * 1024;

export interface Text {
  text: string;
  binary: boolean;
}

function toText(buffer: Buffer): Text {
  if (buffer.length > MAX_FILE) return { text: '', binary: true };
  return buffer.subarray(0, 8000).includes(0)
    ? { text: '', binary: true }
    : { text: buffer.toString('utf8'), binary: false };
}

export async function fileAtCommit(cwd: string, commit: string, path: string): Promise<Text> {
  try {
    return toText(await runBuffer('git', ['show', `${commit}:${path}`], cwd));
  } catch {
    return { text: '', binary: false };
  }
}

/** Reads a file from disk only when its real path stays inside `root`. */
export async function fileOnDisk(root: string, path: string): Promise<Text | null> {
  const real = await realInside([root], join(root, path));
  if (!real) return null;
  // Stat before opening: opening a FIFO for reading blocks until a writer shows up.
  if (!(await stat(real).catch(() => null))?.isFile()) return null;
  const handle = await open(real, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    // Checked again on the handle in case the file was swapped after the stat.
    const info = await handle.stat();
    if (!info.isFile()) return null;
    if (info.size > MAX_FILE) return { text: '', binary: true };
    return toText(await handle.readFile());
  } finally {
    await handle.close();
  }
}

export async function trackedMarkdown(repo: string): Promise<string[]> {
  const out = await git(repo, 'ls-files', '-z', '--', '*.md');
  return out.split('\0').filter(Boolean);
}
