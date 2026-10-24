import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  CODE_RESOLVE_MAX_REFS,
  type CodeFile,
  type CodeFilePage,
  type CodeRef,
  type CodeResolve,
  type CodeSearchPage,
  type CodeTree,
  refHasSeparator,
} from '../../../server/code-types.ts';
import type { BranchCompare, BranchList, FileDiff } from '../../../server/types.ts';
import { get } from './api.ts';
import { chunk } from './utils.ts';

export type { CodeMatch, CodeRef, CodeTreeEntry } from '../../../server/code-types.ts';

const QUICK_OPEN_LIMIT = 50;
export const CODE_SEARCH_PAGE_SIZE = 100;

const enc = encodeURIComponent;
const code = (project: string) => `/projects/${enc(project)}/code`;

export const useCodeTree = (project: string, path: string) =>
  useQuery({
    queryKey: ['code-tree', project, path],
    queryFn: () => get<CodeTree>(`${code(project)}/tree?path=${enc(path)}`),
  });

export const useCodeFiles = (project: string, q: string) =>
  useQuery({
    queryKey: ['code-files', project, q],
    queryFn: () => get<CodeFilePage>(`${code(project)}/files?q=${enc(q)}&limit=${QUICK_OPEN_LIMIT}`),
    placeholderData: keepPreviousData,
  });

export const useCodeFile = (project: string, path: string) =>
  useQuery({
    queryKey: ['code-file', project, path],
    queryFn: () => get<CodeFile>(`${code(project)}/file?path=${enc(path)}`),
  });

export interface CodeSearchParams {
  q?: string;
  case?: boolean;
  offset?: number;
}

export const useCodeSearch = (
  project: string,
  { q = '', case: matchCase = false, offset = 0 }: CodeSearchParams,
) =>
  useQuery({
    queryKey: ['code-search', project, q, matchCase, offset],
    enabled: q !== '',
    queryFn: () =>
      get<CodeSearchPage>(
        `${code(project)}/search?q=${enc(q)}&case=${matchCase}&limit=${CODE_SEARCH_PAGE_SIZE}&offset=${offset}`,
      ),
  });

export const useBranches = (project: string) =>
  useQuery({
    queryKey: ['branches', project],
    queryFn: () => get<BranchList>(`${code(project)}/branches`),
  });

const pair = (base: string, head: string) => `base=${enc(base)}&head=${enc(head)}`;

export const useBranchCompare = (project: string, base: string | undefined, head: string | undefined) =>
  useQuery({
    queryKey: ['branch-compare', project, base, head],
    enabled: base !== undefined && head !== undefined,
    queryFn: () => get<BranchCompare>(`${code(project)}/compare?${pair(base ?? '', head ?? '')}`),
  });

export const useBranchFileDiff = (
  project: string,
  base: string | undefined,
  head: string | undefined,
  path: string | undefined,
) =>
  useQuery({
    queryKey: ['branch-file-diff', project, base, head, path],
    enabled: base !== undefined && head !== undefined && path !== undefined,
    queryFn: () =>
      get<FileDiff>(`${code(project)}/compare/file?${pair(base ?? '', head ?? '')}&path=${enc(path ?? '')}`),
  });

type Waiter = { resolve: (ref: CodeRef | null) => void; reject: (error: unknown) => void };
const pendingRefs = new Map<string, Map<string, Waiter[]>>();

function flushRefs(project: string): void {
  const batch = pendingRefs.get(project);
  pendingRefs.delete(project);
  if (!batch) return;
  for (const refs of chunk([...batch.keys()], CODE_RESOLVE_MAX_REFS)) {
    const settle = (each: (waiter: Waiter, ref: string) => void) => {
      for (const ref of refs) for (const waiter of batch.get(ref) ?? []) each(waiter, ref);
    };
    get<CodeResolve>(`${code(project)}/resolve?${refs.map((r) => `refs=${enc(r)}`).join('&')}`).then(
      (res) => settle((w, ref) => w.resolve(res.refs[ref] ?? null)),
      (error: unknown) => settle((w) => w.reject(error)),
    );
  }
}

/** Queues a ref; every ref queued in the same tick (all of a page's links) goes out in one request. */
function resolveRef(project: string, ref: string): Promise<CodeRef | null> {
  if (refHasSeparator(ref)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let batch = pendingRefs.get(project);
    if (!batch) {
      batch = new Map();
      pendingRefs.set(project, batch);
      setTimeout(() => flushRefs(project), 0);
    }
    batch.set(ref, [...(batch.get(ref) ?? []), { resolve, reject }]);
  });
}

export const useCodeRef = (project: string, ref: string) =>
  useQuery({
    queryKey: ['code-ref', project, ref],
    queryFn: () => resolveRef(project, ref),
    staleTime: 60_000,
  });
