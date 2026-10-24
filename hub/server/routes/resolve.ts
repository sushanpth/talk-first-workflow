import { isAbsolute, relative } from 'node:path';
import { Hono } from 'hono';
import { listWorktrees, resolveCommit, trackedMarkdown } from '../git.ts';
import { memoryDump, memoryStatus } from '../memory.ts';
import { realInside } from '../paths.ts';
import { fail, type RouteContext } from './context.ts';

/** Maps a file the launcher was asked to open to its page in the UI. */
export function resolveRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  routes.get('/resolve', async (c) => {
    const kind = c.req.query('kind');
    const target = c.req.query('path') ?? '';
    const list = await ctx.projects.list();
    const enc = encodeURIComponent;
    if (kind === 'project' || kind === 'doc') {
      const repo = c.req.query('repo') ?? fail(400, 'repo is required');
      const root = await memoryStatus(repo).catch(() => fail(404, 'not a project'));
      const p = list.find((x) => x.memoryDir === root.memory_dir) ?? fail(404, 'project not registered');
      if (kind === 'project') return c.json({ url: `/p/${enc(p.id)}/plans` });
      const rel = isAbsolute(target) ? relative(root.repo_root, target) : target;
      if (!(await trackedMarkdown(ctx.repoOf(p))).includes(rel)) fail(404, 'not a tracked markdown file');
      return c.json({ url: `/p/${enc(p.id)}/docs/${rel.split('/').map(enc).join('/')}` });
    }
    if (kind === 'plan' || kind === 'note') {
      const real =
        (await realInside(await ctx.projects.roots(), target)) ??
        fail(404, 'file is not in a known memory folder');
      for (const p of list) {
        const data = await memoryDump(p.memoryDir);
        const items = kind === 'plan' ? data.briefs : data.notes;
        const found = items.find((item) => item.path === real || item.path === target);
        if (found && 'file' in found) return c.json({ url: `/p/${enc(p.id)}/plans/${enc(found.file)}` });
        if (found) return c.json({ url: `/p/${enc(p.id)}/memory/${enc(found.name)}` });
      }
      return fail(404, `not a ${kind} in a known memory folder`);
    }
    if (kind === 'worktree') {
      const real =
        (await realInside(await ctx.projects.roots(), target)) ??
        fail(404, 'worktree is not in a known repo');
      for (const p of list) {
        if (!p.repo) continue;
        const tree = (await listWorktrees(p.repo)).find((w) => w.path === real || w.path === target);
        if (!tree) continue;
        const base = c.req.query('base');
        const sha = base ? ((await resolveCommit(tree.path, base)) ?? fail(400, 'unknown base commit')) : '';
        return c.json({ url: `/p/${enc(p.id)}/worktrees/${enc(tree.name)}${sha ? `?base=${sha}` : ''}` });
      }
      return fail(404, 'not a linked worktree of a known repo');
    }
    return fail(400, 'kind must be project, plan, note, doc or worktree');
  });

  return routes;
}
