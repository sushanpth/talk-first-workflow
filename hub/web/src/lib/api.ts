import { keepPreviousData, type Query, useQuery } from '@tanstack/react-query';
import type {
  Brief,
  DocFile,
  DocPage,
  FileDiff,
  MemoryPage,
  Note,
  PlanPage,
  Project,
  ProjectPage,
  SortKey,
  WorktreeDiff,
  WorktreePage,
} from '../../../server/types.ts';
import { type ListSearch, listSearchParams, type MemorySearch } from './list-search.ts';

export type {
  AgentWorktree,
  Brief,
  ChangedFile,
  Link,
  Note,
  Page,
  Project,
} from '../../../server/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  return body as T;
}

const enc = encodeURIComponent;
const p = (project: string) => `/projects/${enc(project)}`;
const withBase = (base: string | undefined) => (base ? `base=${enc(base)}` : '');

// Keeps the current page on screen while the next loads, but never shows another project's list.
const keepPageOf =
  (project: string) =>
  <T>(prev: T | undefined, prevQuery: Query<T, Error, T, readonly unknown[]> | undefined) =>
    prevQuery?.queryKey[1] === project ? prev : undefined;

export const useProjects = (search: ListSearch<SortKey<'projects'>>) =>
  useQuery({
    queryKey: ['projects', search],
    queryFn: () => get<ProjectPage>(`/projects${listSearchParams(search)}`),
    placeholderData: keepPreviousData,
  });

export const useProject = (project: string) =>
  useQuery({ queryKey: ['project', project], queryFn: () => get<Project>(p(project)) });

export const usePlans = (project: string, search: ListSearch<SortKey<'plans'>>) =>
  useQuery({
    queryKey: ['plans', project, search],
    queryFn: () => get<PlanPage>(`${p(project)}/plans${listSearchParams(search)}`),
    placeholderData: keepPageOf(project),
  });

export const usePlan = (project: string, file: string) =>
  useQuery({
    queryKey: ['plan', project, file],
    queryFn: () => get<Brief>(`${p(project)}/plans/${enc(file)}`),
  });

export const useMemory = (project: string, search: MemorySearch) =>
  useQuery({
    queryKey: ['memory', project, search],
    queryFn: () => get<MemoryPage>(`${p(project)}/memory${listSearchParams(search)}`),
    placeholderData: keepPageOf(project),
  });

export const useNote = (project: string, name: string) =>
  useQuery({
    queryKey: ['note', project, name],
    queryFn: () => get<Note>(`${p(project)}/memory/${enc(name)}`),
  });

export const useDocs = (project: string, search: ListSearch<SortKey<'docs'>>) =>
  useQuery({
    queryKey: ['docs', project, search],
    queryFn: () => get<DocPage>(`${p(project)}/docs${listSearchParams(search)}`),
    placeholderData: keepPageOf(project),
  });

export const useDoc = (project: string, path: string) =>
  useQuery({
    queryKey: ['doc', project, path],
    queryFn: () => get<DocFile>(`${p(project)}/doc?path=${enc(path)}`),
  });

export const useWorktrees = (project: string, search: ListSearch<SortKey<'worktrees'>>) =>
  useQuery({
    queryKey: ['worktrees', project, search],
    queryFn: () => get<WorktreePage>(`${p(project)}/worktrees${listSearchParams(search)}`),
    placeholderData: keepPageOf(project),
  });

export const useWorktreeDiff = (project: string, name: string, base?: string) =>
  useQuery({
    queryKey: ['worktree', project, name, base],
    queryFn: () => get<WorktreeDiff>(`${p(project)}/worktrees/${enc(name)}?${withBase(base)}`),
  });

export const useFileDiff = (project: string, name: string, path: string | undefined, base?: string) =>
  useQuery({
    queryKey: ['file-diff', project, name, path, base],
    enabled: path !== undefined,
    queryFn: () =>
      get<FileDiff>(`${p(project)}/worktrees/${enc(name)}/file?path=${enc(path ?? '')}&${withBase(base)}`),
  });
