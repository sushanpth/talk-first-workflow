import { Hono } from 'hono';
import { paginateFilling } from '../paginate.ts';
import { modifiedAt } from '../paths.ts';
import { listQuerySchemas, type MemoryPage, type NoteSummary } from '../types.ts';
import { fail, listQuery, type RouteContext } from './context.ts';

export function memoryRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  routes.get('/projects/:id/memory', async (c) => {
    const query = listQuery(c, listQuerySchemas.memory);
    const data = await ctx.dump(c.req.param('id'));
    const notes = data.notes
      .filter((n) => !query.type || n.type === query.type)
      .map(
        ({ name, description, type, path }): NoteSummary => ({
          name,
          description,
          type,
          path,
          modified: null,
        }),
      );
    const page: MemoryPage = {
      memoryDir: data.memory_dir,
      index: data.index,
      ...(await paginateFilling(
        notes,
        query,
        {
          text: (n) => [n.name, n.description],
          keys: { name: (n) => n.name, type: (n) => n.type, modified: (n) => n.modified },
        },
        'modified',
        async (n) => ({ ...n, modified: await modifiedAt(n.path) }),
      )),
    };
    return c.json(page);
  });

  routes.get('/projects/:id/memory/:note', async (c) => {
    const { notes } = await ctx.dump(c.req.param('id'));
    return c.json(notes.find((n) => n.name === c.req.param('note')) ?? fail(404, 'no such note'));
  });

  return routes;
}
