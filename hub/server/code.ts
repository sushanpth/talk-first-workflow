import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { type FileHandle, lstat, open, readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CODE_FILE_MAX_BYTES,
  CODE_MATCH_LINE_MAX,
  CODE_SEARCH_MAX_MATCHES,
  CODE_SEARCH_TIMEOUT_MS,
  type CodeFile,
  type CodeMatch,
  type CodeRef,
  type CodeTree,
  type CodeTreeEntry,
  parseCodeRef,
} from './code-types.ts';
import { realInside } from './paths.ts';
import { run } from './run.ts';

const BINARY_SNIFF_BYTES = 8192;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Drops empty and `.` segments; the query schemas already refuse `..` and leading `/`. */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .join('/');
}

export interface TrackedFiles {
  /** In `git ls-files` order. */
  list: string[];
  set: Set<string>;
}

const cache = new Map<string, { key: string; files: TrackedFiles }>();

/** The index of `repo`, following the gitfile a linked worktree has in place of `.git`. */
async function indexFile(repo: string): Promise<string | null> {
  const dotGit = join(repo, '.git');
  const info = await stat(dotGit).catch(() => null);
  if (info?.isDirectory()) return join(dotGit, 'index');
  if (!info?.isFile()) return null;
  const gitdir = /^gitdir: (.+)$/m.exec(await readFile(dotGit, 'utf8'))?.[1]?.trim();
  return gitdir ? join(resolve(repo, gitdir), 'index') : null;
}

// Git rewrites the index through a lock file and rename, so the inode changes on every write.
async function indexKey(repo: string): Promise<string | null> {
  const index = await indexFile(repo);
  if (!index) return null;
  const info = await stat(index, { bigint: true }).catch(() => null);
  return info ? `${info.ino}:${info.mtimeNs}:${info.size}` : 'none';
}

/** Tracked paths, cached per repo until its index changes. */
export async function trackedFiles(repo: string): Promise<TrackedFiles> {
  const key = await indexKey(repo);
  const hit = cache.get(repo);
  if (key !== null && hit?.key === key) return hit.files;
  const list = (await run('git', ['ls-files', '-z'], repo)).split('\0').filter(Boolean);
  const files = { list, set: new Set(list) };
  if (key !== null) cache.set(repo, { key, files });
  return files;
}

/** One level of the tree under `dir`; null when no tracked file lives under it. */
export function treeLevel(files: string[], dir: string): CodeTree | null {
  const prefix = dir ? `${dir}/` : '';
  const dirs = new Set<string>();
  const leaves: string[] = [];
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) leaves.push(rest);
    else dirs.add(rest.slice(0, slash));
  }
  if (dir && dirs.size === 0 && leaves.length === 0) return null;
  const entries = (names: Iterable<string>, type: CodeTreeEntry['type']): CodeTreeEntry[] =>
    [...names].sort(collator.compare).map((name) => ({ name, path: `${prefix}${name}`, type }));
  return { path: dir, entries: [...entries(dirs, 'dir'), ...entries(leaves, 'file')] };
}

export type ReadResult = { file: CodeFile } | { refused: 'missing' | 'outside' | 'not a regular file' };

/** Fills `buffer` from the start of the file, stopping early at end of file. */
async function readInto(handle: FileHandle, buffer: Buffer): Promise<Buffer> {
  let filled = 0;
  while (filled < buffer.length) {
    const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return buffer.subarray(0, filled);
}

/** Reads a tracked file whose real path stays in `repo`; the caller checks it is tracked. */
export async function readCodeFile(repo: string, path: string): Promise<ReadResult> {
  if (!(await lstat(join(repo, path)).catch(() => null))) return { refused: 'missing' };
  const real = await realInside([repo], join(repo, path));
  if (!real) return { refused: 'outside' };
  // Stat before opening: opening a FIFO for reading blocks until a writer shows up.
  if (!(await stat(real).catch(() => null))?.isFile()) return { refused: 'not a regular file' };
  const handle = await open(real, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    // Checked again on the open handle in case the file was swapped after the stat.
    const info = await handle.stat();
    if (!info.isFile()) return { refused: 'not a regular file' };
    const tooLarge = info.size > CODE_FILE_MAX_BYTES;
    const bytes = await readInto(handle, Buffer.alloc(tooLarge ? BINARY_SNIFF_BYTES : info.size));
    const binary = bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0);
    const content = binary || tooLarge ? null : bytes.toString('utf8');
    return { file: { path, size: info.size, binary, tooLarge, content } };
  } finally {
    await handle.close();
  }
}

function trimLine(text: string): string {
  const line = text.trim();
  if (line.length <= CODE_MATCH_LINE_MAX) return line;
  // Cut by code points so a surrogate pair is never split.
  return Array.from(line).slice(0, CODE_MATCH_LINE_MAX).join('');
}

/**
 * Parses `git grep -n --null` records (`path NUL line NUL text LF`) from the front of `buffer`.
 * Returns the bytes after the last complete record.
 */
function takeMatches(buffer: Buffer, out: CodeMatch[], max: number): Buffer {
  let start = 0;
  while (out.length < max) {
    const pathEnd = buffer.indexOf(0, start);
    if (pathEnd === -1) break;
    const lineEnd = buffer.indexOf(0, pathEnd + 1);
    if (lineEnd === -1) break;
    const textEnd = buffer.indexOf(10, lineEnd + 1);
    if (textEnd === -1) break;
    const line = Number(buffer.toString('utf8', pathEnd + 1, lineEnd));
    if (Number.isInteger(line) && line > 0) {
      out.push({
        path: buffer.toString('utf8', start, pathEnd),
        line,
        text: trimLine(buffer.toString('utf8', lineEnd + 1, textEnd)),
      });
    }
    start = textEnd + 1;
  }
  return buffer.subarray(start);
}

export interface SearchResult {
  matches: CodeMatch[];
  truncated: boolean;
}

/** Fixed-string search over tracked text files, stopped by the match cap or the time limit. */
export function searchCode(repo: string, query: string, caseSensitive: boolean): Promise<SearchResult> {
  const args = [
    'grep',
    '-n',
    '-I',
    '--null',
    '--no-color',
    '--no-column',
    '--fixed-strings',
    ...(caseSensitive ? [] : ['-i']),
    // `-e` makes git read the query as the pattern even when it starts with `-`.
    '-e',
    query,
    '--',
  ];
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    const matches: CodeMatch[] = [];
    let pending: Buffer = Buffer.alloc(0);
    let stderr = '';
    let truncated = false;
    const stop = () => {
      truncated = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(stop, CODE_SEARCH_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return;
      pending = takeMatches(Buffer.concat([pending, chunk]), matches, CODE_SEARCH_MAX_MATCHES);
      if (matches.length >= CODE_SEARCH_MAX_MATCHES) stop();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Exit 1 means no matches.
      if (!truncated && code !== 0 && code !== 1) {
        reject(new Error(`git grep failed (${code}): ${stderr.trim().split('\n')[0] ?? ''}`));
      } else {
        resolvePromise({ matches, truncated });
      }
    });
  });
}

/** Each ref mapped to its tracked file and line, or null when it names no tracked file. */
export async function resolveRefs(repo: string, refs: string[]): Promise<Record<string, CodeRef | null>> {
  const { set } = await trackedFiles(repo);
  const realRepo = await realpath(repo).catch(() => repo);
  const out: Record<string, CodeRef | null> = {};
  for (const ref of refs) {
    const parsed = parseCodeRef(ref, repo) ?? (realRepo !== repo ? parseCodeRef(ref, realRepo) : null);
    out[ref] = parsed && set.has(parsed.path) ? parsed : null;
  }
  return out;
}
