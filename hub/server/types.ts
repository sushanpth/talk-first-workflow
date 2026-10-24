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
}

export interface NoteSummary {
  name: string;
  description: string;
  type: string | null;
  path: string;
}

export interface MemoryOverview {
  memoryDir: string;
  index: string;
  notes: NoteSummary[];
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
