import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import { memoryDump } from '../memory.ts';
import type { ProjectStore } from '../projects.ts';
import type { Dump, Project } from '../types.ts';

export const fail = (status: 403 | 404 | 400, message: string): never => {
  throw new HTTPException(status, { message });
};

/** Lookups every feature's routes share. */
export interface RouteContext {
  projects: ProjectStore;
  project: (id: string) => Promise<Project>;
  repoOf: (p: Project) => string;
  dump: (id: string) => Promise<Dump>;
}

export function routeContext(projects: ProjectStore): RouteContext {
  const project = async (id: string): Promise<Project> =>
    (await projects.get(id)) ?? fail(404, 'no such project');
  return {
    projects,
    project,
    repoOf: (p) => p.repo ?? fail(404, 'this project has no repo on disk'),
    dump: async (id) => memoryDump((await project(id)).memoryDir),
  };
}

/** Parses the query string with one of `listQuerySchemas`; a bad value is a 400. */
export function listQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const parsed = schema.safeParse(c.req.query());
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`);
  return fail(400, `bad query: ${issues.join('; ')}`);
}
