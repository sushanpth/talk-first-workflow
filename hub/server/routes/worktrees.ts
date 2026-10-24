import { Hono } from 'hono';
import { labelWorktree, labelWorktrees } from '../agents.ts';
import { changedFiles, defaultBase, fileAtCommit, fileOnDisk, listWorktrees, resolveCommit } from '../git.ts';
import { paginate } from '../paginate.ts';
import { realInside } from '../paths.ts';
import {
  type FileDiff,
  listQuerySchemas,
  type Project,
  type Worktree,
  type WorktreeDiff,
  type WorktreePage,
} from '../types.ts';
import { fail, listQuery, type RouteContext } from './context.ts';

export function worktreeRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  const worktree = async (
    id: string,
    name: string,
  ): Promise<{ p: Project; repo: string; tree: Worktree }> => {
    const p = await ctx.project(id);
    const repo = ctx.repoOf(p);
    const tree = (await listWorktrees(repo)).find((w) => w.name === name) ?? fail(404, 'no such worktree');
    if (!(await realInside(await ctx.projects.roots(), tree.path)))
      fail(403, 'worktree is outside the allowed roots');
    return { p, repo, tree };
  };

  const baseFor = async (repo: string, tree: Worktree, ref: string | undefined): Promise<string> => {
    if (!ref) return defaultBase(repo, tree.path);
    return (await resolveCommit(tree.path, ref)) ?? fail(400, 'unknown base commit');
  };

  routes.get('/projects/:id/worktrees', async (c) => {
    const query = listQuery(c, listQuerySchemas.worktrees);
    const p = await ctx.project(c.req.param('id'));
    const trees = await labelWorktrees(p, await listWorktrees(ctx.repoOf(p)));
    const page: WorktreePage = paginate(trees, query, {
      text: (w) => [w.name, w.branch, w.task],
      keys: { task: (w) => w.task, branch: (w) => w.branch },
    });
    return c.json(page);
  });

  routes.get('/projects/:id/worktrees/:name', async (c) => {
    const { p, repo, tree } = await worktree(c.req.param('id'), c.req.param('name'));
    const base = await baseFor(repo, tree, c.req.query('base'));
    const result: WorktreeDiff = await labelWorktree(p, {
      ...tree,
      base,
      files: await changedFiles(tree.path, base),
    });
    return c.json(result);
  });

  routes.get('/projects/:id/worktrees/:name/file', async (c) => {
    const { repo, tree } = await worktree(c.req.param('id'), c.req.param('name'));
    const base = await baseFor(repo, tree, c.req.query('base'));
    const path = c.req.query('path') ?? fail(400, 'path is required');
    const change =
      (await changedFiles(tree.path, base)).find((f) => f.path === path) ?? fail(404, 'file not changed');
    const before =
      change.status === 'A' || change.status === '?'
        ? { text: '', binary: false }
        : await fileAtCommit(tree.path, base, change.oldPath ?? change.path);
    const after =
      change.status === 'D'
        ? { text: '', binary: false }
        : ((await fileOnDisk(tree.path, change.path)) ?? fail(403, 'path is outside the worktree'));
    const result: FileDiff = {
      ...change,
      original: before.text,
      modified: after.text,
      binary: before.binary || after.binary,
    };
    return c.json(result);
  });

  return routes;
}
