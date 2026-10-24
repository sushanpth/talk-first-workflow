import { Hono } from 'hono';
import {
  branchChanges,
  branchCommit,
  EMPTY_TEXT,
  fileAtCommit,
  fileDiffOf,
  localBranches,
  mergeBase,
  worktreeEntries,
} from '../git.ts';
import type { BranchCompare, BranchList, FileDiff } from '../types.ts';
import { fail, type RouteContext } from './context.ts';

export function compareRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();
  const repo = async (id: string) => ctx.repoOf(await ctx.project(id));

  // Only exact names from `localBranches` reach git, so nothing typed into the URL can read as an option.
  const commitOf = async (root: string, branches: string[], name: string): Promise<string> =>
    (branches.includes(name) ? await branchCommit(root, name) : null) ?? fail(400, `unknown branch: ${name}`);

  const compare = async (root: string, base = '', head = ''): Promise<BranchCompare> => {
    const branches = await localBranches(root);
    const baseCommit = await commitOf(root, branches, base);
    const headCommit = await commitOf(root, branches, head);
    const from =
      (await mergeBase(root, baseCommit, headCommit)) ?? fail(400, `${base} and ${head} share no history`);
    return { base, head, mergeBase: from, headCommit, files: await branchChanges(root, from, headCommit) };
  };

  routes.get('/projects/:id/code/branches', async (c) => {
    const root = await repo(c.req.param('id'));
    const result: BranchList = {
      branches: await localBranches(root),
      current: (await worktreeEntries(root))[0]?.branch ?? null,
    };
    return c.json(result);
  });

  routes.get('/projects/:id/code/compare', async (c) => {
    const root = await repo(c.req.param('id'));
    return c.json(await compare(root, c.req.query('base'), c.req.query('head')));
  });

  routes.get('/projects/:id/code/compare/file', async (c) => {
    const root = await repo(c.req.param('id'));
    const {
      mergeBase: from,
      headCommit,
      files,
    } = await compare(root, c.req.query('base'), c.req.query('head'));
    const path = c.req.query('path') ?? fail(400, 'path is required');
    const change = files.find((f) => f.path === path) ?? fail(404, 'file not changed');
    const before =
      change.status === 'A' ? EMPTY_TEXT : await fileAtCommit(root, from, change.oldPath ?? change.path);
    const after = change.status === 'D' ? EMPTY_TEXT : await fileAtCommit(root, headCommit, change.path);
    const result: FileDiff = fileDiffOf(change, before, after);
    return c.json(result);
  });

  return routes;
}
