import { basename, join } from 'node:path';
import { withRegularFile } from './paths.ts';
import { run, runBuffer } from './run.ts';
import type { ChangedFile, FileDiff, Worktree } from './types.ts';

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

async function verifyCommit(cwd: string, rev: string): Promise<string | null> {
  try {
    return (await git(cwd, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`)).trim();
  } catch {
    return null;
  }
}

/** Resolves a user-supplied ref to a commit sha, refusing anything that could read as an option. */
export async function resolveCommit(cwd: string, ref: string): Promise<string | null> {
  if (!REF_RE.test(ref) || ref.length > 200) return null;
  return verifyCommit(cwd, ref);
}

/** Local branch names (`refs/heads`), A to Z. */
export async function localBranches(repo: string): Promise<string[]> {
  // Ref names can't hold control characters, so newline-separated output is unambiguous.
  const out = await git(repo, 'for-each-ref', '--format=%(refname)', 'refs/heads');
  const prefix = 'refs/heads/';
  return out
    .split('\n')
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => ref.slice(prefix.length));
}

/** A local branch's commit; `name` must come from `localBranches`, so no ref syntax is checked here. */
export const branchCommit = (repo: string, name: string): Promise<string | null> =>
  verifyCommit(repo, `refs/heads/${name}`);

/** Null when the two commits share no history. */
export async function mergeBase(repo: string, a: string, b: string): Promise<string | null> {
  try {
    return (await git(repo, 'merge-base', '--end-of-options', a, b)).trim();
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

/** Committed changes between two commits; untracked files never appear. */
export async function branchChanges(repo: string, from: string, to: string): Promise<ChangedFile[]> {
  return parseNameStatus(
    await git(repo, 'diff', '--name-status', '-M', '-z', '--end-of-options', from, to, '--'),
  );
}

const MAX_FILE = 4 * 1024 * 1024;

export interface Text {
  text: string;
  binary: boolean;
}

/** The missing side of an added or deleted file. */
export const EMPTY_TEXT: Text = { text: '', binary: false };

export function fileDiffOf(change: ChangedFile, before: Text, after: Text): FileDiff {
  return { ...change, original: before.text, modified: after.text, binary: before.binary || after.binary };
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
  const result = await withRegularFile([root], join(root, path), async (handle, info) =>
    info.size > MAX_FILE ? { text: '', binary: true } : toText(await handle.readFile()),
  );
  return 'value' in result ? result.value : null;
}

export async function trackedMarkdown(repo: string): Promise<string[]> {
  const out = await git(repo, 'ls-files', '-z', '--', '*.md');
  return out.split('\0').filter(Boolean);
}
