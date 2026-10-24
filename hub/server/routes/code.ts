import { Hono } from 'hono';
import { normalizePath, readCodeFile, resolveRefs, searchCode, trackedFiles, treeLevel } from '../code.ts';
import {
  type CodeFilePage,
  type CodeResolve,
  type CodeSearchPage,
  codeFileQuerySchema,
  codeFilesQuerySchema,
  codeResolveQuerySchema,
  codeSearchQuerySchema,
  codeTreeQuerySchema,
} from '../code-types.ts';
import { paginate } from '../paginate.ts';
import { fail, listQuery, type RouteContext } from './context.ts';

const byPath = { text: (x: { path: string }) => [x.path], keys: { path: (x: { path: string }) => x.path } };

export function codeRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();
  const repo = async (id: string) => ctx.repoOf(await ctx.project(id));

  routes.get('/projects/:id/code/tree', async (c) => {
    const query = listQuery(c, codeTreeQuerySchema);
    const { list } = await trackedFiles(await repo(c.req.param('id')));
    return c.json(
      treeLevel(list, normalizePath(query.path)) ?? fail(404, 'no tracked files under that path'),
    );
  });

  routes.get('/projects/:id/code/files', async (c) => {
    const query = listQuery(c, codeFilesQuerySchema);
    const { list } = await trackedFiles(await repo(c.req.param('id')));
    const page: CodeFilePage = paginate(
      list.map((path) => ({ path })),
      { ...query, sort: 'path', order: 'asc' },
      byPath,
    );
    return c.json(page);
  });

  routes.get('/projects/:id/code/file', async (c) => {
    const query = listQuery(c, codeFileQuerySchema);
    const root = await repo(c.req.param('id'));
    const path = normalizePath(query.path);
    if (!(await trackedFiles(root)).set.has(path)) fail(404, 'not a tracked file');
    const result = await readCodeFile(root, path);
    if ('refused' in result) {
      return result.refused === 'missing'
        ? fail(404, 'file is missing on disk')
        : fail(403, result.refused === 'outside' ? 'path is outside the repo' : 'not a regular file');
    }
    return c.json(result.file);
  });

  routes.get('/projects/:id/code/search', async (c) => {
    const query = listQuery(c, codeSearchQuerySchema);
    const { matches, truncated } = await searchCode(await repo(c.req.param('id')), query.q, query.case);
    // Sorting by path alone is stable, so matches keep their line order within a file.
    const page = paginate(matches, { ...query, q: '', sort: 'path', order: 'asc' }, byPath);
    const result: CodeSearchPage = { ...page, truncated };
    return c.json(result);
  });

  routes.get('/projects/:id/code/resolve', async (c) => {
    // `queries` keeps repeated params, which `listQuery` would collapse to the first.
    const parsed = codeResolveQuerySchema.safeParse({ refs: c.req.queries('refs') ?? [] });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`);
      return fail(400, `bad query: ${issues.join('; ')}`);
    }
    const result: CodeResolve = { refs: await resolveRefs(await repo(c.req.param('id')), parsed.data.refs) };
    return c.json(result);
  });

  return routes;
}
