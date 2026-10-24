import { z } from 'zod';
import { LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX, type Page } from './types.ts';

// Shared by the code routes and the web app, so nothing here may import Node modules.

export const CODE_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const CODE_SEARCH_MAX_MATCHES = 500;
export const CODE_SEARCH_TIMEOUT_MS = 5000;
/** Longer match lines are cut to this many characters. */
export const CODE_MATCH_LINE_MAX = 300;
export const CODE_SEARCH_QUERY_MAX = 200;
export const CODE_RESOLVE_MAX_REFS = 100;
export const CODE_REF_MAX_LENGTH = 1024;

/** Path segments with `.` and empty ones dropped and `..` applied; null when `..` climbs above the start. */
function segmentsOf(path: string): string[] | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out;
}

const repoPath = z
  .string()
  .max(4096)
  .refine((p) => !p.includes('\0'), 'must not contain NUL')
  .refine((p) => !p.startsWith('/'), 'must be repo-relative')
  .refine((p) => !p.split('/').includes('..'), 'must not contain ..');

const paging = {
  limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
};

const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .default(false);

// GET /projects/:id/code/tree
export const codeTreeQuerySchema = z.object({
  /** Directory to list; empty for the repo root. */
  path: repoPath.default(''),
});

export interface CodeTreeEntry {
  name: string;
  /** Repo-relative. */
  path: string;
  type: 'file' | 'dir';
}

export interface CodeTree {
  path: string;
  /** One level only: directories first, then files, each A to Z. */
  entries: CodeTreeEntry[];
}

// GET /projects/:id/code/files (quick open)
export const codeFilesQuerySchema = z.object({
  /** Case-insensitive substring match on the path; empty matches everything. */
  q: z.string().trim().max(CODE_SEARCH_QUERY_MAX).default(''),
  ...paging,
});

export type CodeFileEntry = { path: string };
export type CodeFilePage = Page<CodeFileEntry>;

// GET /projects/:id/code/file
export const codeFileQuerySchema = z.object({ path: repoPath.min(1) });

export interface CodeFile {
  path: string;
  size: number;
  binary: boolean;
  /** Over CODE_FILE_MAX_BYTES. */
  tooLarge: boolean;
  /** Null when the file is binary or too large. */
  content: string | null;
}

// GET /projects/:id/code/search
export const codeSearchQuerySchema = z.object({
  /** Fixed string, not a regex; not trimmed, since spaces can matter. */
  q: z.string().min(1).max(CODE_SEARCH_QUERY_MAX),
  /** True for a case-sensitive search. */
  case: queryBoolean,
  ...paging,
});

export interface CodeMatch {
  path: string;
  /** 1-based. */
  line: number;
  /** The matching line, trimmed and cut to CODE_MATCH_LINE_MAX. */
  text: string;
}

export interface CodeSearchPage extends Page<CodeMatch> {
  /** True when the match cap or the time limit stopped the search early. */
  truncated: boolean;
}

// GET /projects/:id/code/resolve
export const codeResolveQuerySchema = z.object({
  /** Comma-separated, repeated, or both; pass `c.req.queries('refs')` to keep repeats. Paths with commas can't be sent. */
  refs: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => [
      ...new Set(
        (Array.isArray(v) ? v : [v])
          .flatMap((s) => s.split(','))
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().max(CODE_REF_MAX_LENGTH)).min(1).max(CODE_RESOLVE_MAX_REFS)),
});

export interface CodeRef {
  /** Repo-relative. */
  path: string;
  line: number | null;
}

export interface CodeResolve {
  /** Keyed by each input ref as sent; null when it isn't a tracked file. */
  refs: Record<string, CodeRef | null>;
}

const LINE_SUFFIX = /^(.*?)(?::(\d{1,9})(?:[:-]\d+)?|#L(\d{1,9})(?:-L?\d+)?)$/;
// Characters that mark a glob, URL, variable or Windows path rather than a plain repo path.
const NOT_A_PATH = /[\\:*?"<>|{}$`#~]/;

/**
 * Reads a candidate code reference like `hub/server/app.ts:42`, `./src/x.ts` or an absolute path
 * inside `repoRoot`. Says nothing about whether the file exists; the resolve route checks that.
 */
export function parseCodeRef(text: string, repoRoot?: string): CodeRef | null {
  const trimmed = text
    .trim()
    .replace(/^[(['"]+/, '')
    .replace(/[.,;!?)\]}'"]+$/, '');
  if (trimmed === '' || /\s/.test(trimmed) || trimmed.length > CODE_REF_MAX_LENGTH) return null;

  const m = LINE_SUFFIX.exec(trimmed);
  const raw = m ? (m[1] ?? '') : trimmed;
  const lineText = m ? (m[2] ?? m[3]) : undefined;
  const line = lineText && Number(lineText) > 0 ? Number(lineText) : null;
  if (raw === '' || raw.endsWith('/') || NOT_A_PATH.test(raw)) return null;

  let segments: string[] | null;
  if (raw.startsWith('/')) {
    const abs = segmentsOf(raw);
    const root = repoRoot ? segmentsOf(repoRoot) : null;
    if (!abs || !root || abs.length <= root.length || root.some((s, i) => abs[i] !== s)) return null;
    segments = abs.slice(root.length);
  } else {
    segments = segmentsOf(raw);
  }
  if (!segments || segments.length === 0) return null;
  return { path: segments.join('/'), line };
}
