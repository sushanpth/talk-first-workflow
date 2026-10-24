import { z } from 'zod';

// Shapes of `scripts/memory.py` JSON output; the hub reads memory only through these.
export const linkSchema = z.object({ target: z.string(), name: z.string().nullable() });

export const memoryProjectSchema = z.object({
  name: z.string(),
  memory_dir: z.string(),
  repo: z.string(),
  note_count: z.number().int(),
  brief_count: z.number().int(),
});

export const memoryStatusSchema = z.object({
  repo_root: z.string(),
  is_git: z.boolean(),
  memory_dir: z.string(),
  legacy_dir: z.string(),
  note_count: z.number().int(),
});

export const noteSchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string().nullable(),
  body: z.string(),
  links: z.array(linkSchema),
  backlinks: z.array(z.string()),
});

export const briefSchema = z.object({
  path: z.string(),
  file: z.string(),
  title: z.string(),
  body: z.string(),
  links: z.array(linkSchema),
});

export const dumpSchema = z.object({
  memory_dir: z.string(),
  index: z.string(),
  notes: z.array(noteSchema),
  briefs: z.array(briefSchema),
});

export type Link = z.infer<typeof linkSchema>;
export type MemoryProject = z.infer<typeof memoryProjectSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Brief = z.infer<typeof briefSchema>;
export type Dump = z.infer<typeof dumpSchema>;

// API responses.
export interface Project {
  id: string;
  name: string;
  repo: string | null;
  memoryDir: string;
  noteCount: number;
  briefCount: number;
}

export interface PlanSummary {
  file: string;
  title: string;
  path: string;
  /** `YYYY-MM-DD` from the file name's prefix; null when the name has none. */
  date: string | null;
}

export interface NoteSummary {
  name: string;
  description: string;
  type: string | null;
  path: string;
  /** File mtime as ISO 8601; null when the file can't be stat'ed. */
  modified: string | null;
}

export interface DocSummary {
  /** Repo-relative, as `git ls-files` prints it. */
  path: string;
  /** File mtime as ISO 8601; null when the tracked file is missing on disk. */
  modified: string | null;
}

export interface DocFile {
  path: string;
  text: string;
}

export interface Worktree {
  name: string;
  path: string;
  branch: string | null;
  head: string;
}

/** What the hub knows about the agent that ran in a worktree, from Claude Code's records. */
export interface AgentInfo {
  task: string | null;
  agentType: string | null;
  agentId: string | null;
  briefPath: string | null;
}

export interface AgentWorktree extends Worktree, AgentInfo {}

export interface ChangedFile {
  status: string;
  path: string;
  oldPath?: string;
}

export interface WorktreeDiff extends AgentWorktree {
  base: string;
  files: ChangedFile[];
}

export interface FileDiff extends ChangedFile {
  original: string;
  modified: string;
  binary: boolean;
}

// List paging: every list route filters, sorts and pages on the server.
export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;

export const orderSchema = z.enum(['asc', 'desc']);
export type Order = z.infer<typeof orderSchema>;

export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Allowed sort keys per list; the first key is the default. */
export const SORT_KEYS = {
  projects: ['name'],
  plans: ['date', 'title'],
  memory: ['name', 'type', 'modified'],
  docs: ['path', 'modified'],
  worktrees: ['task', 'branch'],
} as const;

export type ListName = keyof typeof SORT_KEYS;
export type SortKey<L extends ListName> = (typeof SORT_KEYS)[L][number];

/** Order used when the query has none: newest first for dates, A to Z otherwise. */
export const defaultOrder = (sort: string): Order =>
  sort === 'date' || sort === 'modified' ? 'desc' : 'asc';

const listQueryBase = z.object({
  /** Case-insensitive substring match on the list's text fields; empty matches everything. */
  q: z.string().trim().max(200).default(''),
  order: orderSchema.optional(),
  limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
});

const withOrder = <T extends { sort: string; order?: Order | undefined }>(query: T) => ({
  ...query,
  order: query.order ?? defaultOrder(query.sort),
});

/** Validators for each list's query string; parse `c.req.query()` and answer 400 on failure. */
export const listQuerySchemas = {
  projects: listQueryBase.extend({ sort: z.enum(SORT_KEYS.projects).default('name') }).transform(withOrder),
  plans: listQueryBase.extend({ sort: z.enum(SORT_KEYS.plans).default('date') }).transform(withOrder),
  memory: listQueryBase
    .extend({
      sort: z.enum(SORT_KEYS.memory).default('name'),
      /** Only notes of this type; absent means every type. */
      type: z.enum(MEMORY_TYPES).optional(),
    })
    .transform(withOrder),
  docs: listQueryBase.extend({ sort: z.enum(SORT_KEYS.docs).default('path') }).transform(withOrder),
  worktrees: listQueryBase.extend({ sort: z.enum(SORT_KEYS.worktrees).default('task') }).transform(withOrder),
};

/** A parsed list query: every field filled in, `order` resolved from the sort key when absent. */
export interface ListQuery<S extends string = string> {
  q: string;
  sort: S;
  order: Order;
  limit: number;
  offset: number;
}

export type ProjectListQuery = z.output<typeof listQuerySchemas.projects>;
export type PlanListQuery = z.output<typeof listQuerySchemas.plans>;
export type MemoryListQuery = z.output<typeof listQuerySchemas.memory>;
export type DocListQuery = z.output<typeof listQuerySchemas.docs>;
export type WorktreeListQuery = z.output<typeof listQuerySchemas.worktrees>;

export interface Page<T> {
  items: T[];
  /** Matches after filtering, before slicing. */
  total: number;
  /** Offset of the next page; null on the last page. */
  nextOffset: number | null;
}

// List route responses.
export type ProjectPage = Page<Project>;
export type PlanPage = Page<PlanSummary>;
export type DocPage = Page<DocSummary>;
export type WorktreePage = Page<AgentWorktree>;

/** `GET /projects/:id/memory`: one page of notes beside the whole, unfiltered index. */
export interface MemoryPage extends Page<NoteSummary> {
  memoryDir: string;
  /** MEMORY.md text. */
  index: string;
}
