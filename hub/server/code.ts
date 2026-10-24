import { spawn } from 'node:child_process';
import { type FileHandle, lstat, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
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
import { type FileRefusal, withRegularFile } from './paths.ts';
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

export type ReadResult = { file: CodeFile } | { refused: 'missing' | 'untracked target' | FileRefusal };

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

/**
 * Reads a file whose real path is itself in `tracked`, so a tracked symlink can't serve an
 * untracked file such as `.env`. The caller checks that `path` is tracked.
 */
export async function readCodeFile(repo: string, path: string, tracked: Set<string>): Promise<ReadResult> {
  if (!(await lstat(join(repo, path)).catch(() => null))) return { refused: 'missing' };
  const realRepo = await realpath(repo);
  const result = await withRegularFile(
    [repo],
    join(repo, path),
    async (handle, info, real): Promise<ReadResult> => {
      if (!tracked.has(relative(realRepo, real).split(sep).join('/'))) return { refused: 'untracked target' };
      const tooLarge = info.size > CODE_FILE_MAX_BYTES;
      const bytes = await readInto(handle, Buffer.alloc(tooLarge ? BINARY_SNIFF_BYTES : info.size));
      const binary = bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0);
      const content = binary || tooLarge ? null : bytes.toString('utf8');
      return { file: { path, size: info.size, binary, tooLarge, content } };
    },
  );
  return 'value' in result ? result.value : result;
}

function trimLine(text: string): string {
  const line = text.trim();
  if (line.length <= CODE_MATCH_LINE_MAX) return line;
  // Cut by code points so a surrogate pair is never split.
  return Array.from(line).slice(0, CODE_MATCH_LINE_MAX).join('');
}

// Room for CODE_MATCH_LINE_MAX code points; the rest of a long line is skipped, not buffered.
const TEXT_KEEP_BYTES = CODE_MATCH_LINE_MAX * 4;
const PATH_KEEP_BYTES = 64 * 1024;
const STDERR_KEEP_CHARS = 4096;

/**
 * Streams `git grep -n --null` records (`path NUL line NUL text LF`) into `out`.
 * Scans each chunk once and keeps only the head of each field, so a huge line stays linear.
 */
class MatchParser {
  private parts: Buffer[] = [];
  private kept = 0;
  private field: 'path' | 'line' | 'text' = 'path';
  private path = '';
  private line = 0;
  private readonly out: CodeMatch[];
  private readonly max: number;

  constructor(out: CodeMatch[], max: number) {
    this.out = out;
    this.max = max;
  }

  push(chunk: Buffer): void {
    let start = 0;
    while (start < chunk.length && this.out.length < this.max) {
      const end = chunk.indexOf(this.field === 'text' ? 10 : 0, start);
      this.keep(chunk.subarray(start, end === -1 ? chunk.length : end));
      if (end === -1) return;
      this.endField();
      start = end + 1;
    }
  }

  private keep(bytes: Buffer): void {
    const room = (this.field === 'text' ? TEXT_KEEP_BYTES : PATH_KEEP_BYTES) - this.kept;
    if (room <= 0 || bytes.length === 0) return;
    // Copied so a kept slice doesn't pin the whole chunk.
    const part = Buffer.from(bytes.subarray(0, room));
    this.parts.push(part);
    this.kept += part.length;
  }

  private take(): string {
    const text = Buffer.concat(this.parts).toString('utf8');
    this.parts = [];
    this.kept = 0;
    return text;
  }

  private endField(): void {
    if (this.field === 'path') {
      this.path = this.take();
      this.field = 'line';
    } else if (this.field === 'line') {
      this.line = Number(this.take());
      this.field = 'text';
    } else {
      const text = trimLine(this.take());
      if (Number.isInteger(this.line) && this.line > 0)
        this.out.push({ path: this.path, line: this.line, text });
      this.field = 'path';
    }
  }
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
    const parser = new MatchParser(matches, CODE_SEARCH_MAX_MATCHES);
    let stderr = '';
    let truncated = false;
    const stop = () => {
      truncated = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(stop, CODE_SEARCH_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return;
      parser.push(chunk);
      if (matches.length >= CODE_SEARCH_MAX_MATCHES) stop();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < STDERR_KEEP_CHARS) stderr += chunk.toString('utf8', 0, STDERR_KEEP_CHARS);
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
