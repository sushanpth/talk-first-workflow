import { useQuery } from '@tanstack/react-query';
import type {
  AgentWorktree,
  Brief,
  DocFile,
  FileDiff,
  MemoryOverview,
  Note,
  PlanSummary,
  Project,
  WorktreeDiff,
} from '../../../server/types.ts';

export type { AgentWorktree, Brief, ChangedFile, Link, Note, Project } from '../../../server/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
  return body as T;
}

const enc = encodeURIComponent;
const p = (project: string) => `/projects/${enc(project)}`;
const withBase = (base: string | undefined) => (base ? `base=${enc(base)}` : '');

export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });

export const useProject = (project: string) =>
  useQuery({ queryKey: ['project', project], queryFn: () => get<Project>(p(project)) });

export const usePlans = (project: string) =>
  useQuery({ queryKey: ['plans', project], queryFn: () => get<PlanSummary[]>(`${p(project)}/plans`) });

export const usePlan = (project: string, file: string) =>
  useQuery({
    queryKey: ['plan', project, file],
    queryFn: () => get<Brief>(`${p(project)}/plans/${enc(file)}`),
  });

export const useMemory = (project: string) =>
  useQuery({ queryKey: ['memory', project], queryFn: () => get<MemoryOverview>(`${p(project)}/memory`) });

export const useNote = (project: string, name: string) =>
  useQuery({
    queryKey: ['note', project, name],
    queryFn: () => get<Note>(`${p(project)}/memory/${enc(name)}`),
  });

export const useDocs = (project: string) =>
  useQuery({ queryKey: ['docs', project], queryFn: () => get<string[]>(`${p(project)}/docs`) });

export const useDoc = (project: string, path: string) =>
  useQuery({
    queryKey: ['doc', project, path],
    queryFn: () => get<DocFile>(`${p(project)}/doc?path=${enc(path)}`),
  });

export const useWorktrees = (project: string) =>
  useQuery({
    queryKey: ['worktrees', project],
    queryFn: () => get<AgentWorktree[]>(`${p(project)}/worktrees`),
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
