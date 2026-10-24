import { join } from 'node:path';
import { Hono } from 'hono';
import { fileOnDisk, trackedMarkdown } from '../git.ts';
import { paginateFilling } from '../paginate.ts';
import { modifiedAt, realInside } from '../paths.ts';
import { type DocPage, type DocSummary, listQuerySchemas } from '../types.ts';
import { fail, listQuery, type RouteContext } from './context.ts';

// Only stat files whose real path stays in the repo, so a symlink can't reveal an outside file.
async function withModified(repo: string, { path }: DocSummary): Promise<DocSummary> {
  const real = await realInside([repo], join(repo, path));
  return { path, modified: real ? await modifiedAt(real) : null };
}

export function docRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  routes.get('/projects/:id/docs', async (c) => {
    const query = listQuery(c, listQuerySchemas.docs);
    const repo = ctx.repoOf(await ctx.project(c.req.param('id')));
    const docs = (await trackedMarkdown(repo)).map((path): DocSummary => ({ path, modified: null }));
    const page: DocPage = await paginateFilling(
      docs,
      query,
      { text: (d) => [d.path], keys: { path: (d) => d.path, modified: (d) => d.modified } },
      'modified',
      (d) => withModified(repo, d),
    );
    return c.json(page);
  });

  routes.get('/projects/:id/doc', async (c) => {
    const repo = ctx.repoOf(await ctx.project(c.req.param('id')));
    const path = c.req.query('path') ?? fail(400, 'path is required');
    if (!(await trackedMarkdown(repo)).includes(path)) fail(404, 'not a tracked markdown file');
    const file = (await fileOnDisk(repo, path)) ?? fail(403, 'path is outside the repo');
    return c.json({ path, text: file.text });
  });

  return routes;
}
