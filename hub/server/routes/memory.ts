import { Hono } from 'hono';
import { paginate } from '../paginate.ts';
import { modifiedAt } from '../paths.ts';
import { listQuerySchemas, type MemoryPage, type NoteSummary } from '../types.ts';
import { fail, listQuery, type RouteContext } from './context.ts';

export function memoryRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  routes.get('/projects/:id/memory', async (c) => {
    const query = listQuery(c, listQuerySchemas.memory);
    const data = await ctx.dump(c.req.param('id'));
    const notes = await Promise.all(
      data.notes
        .filter((n) => !query.type || n.type === query.type)
        .map(
          async ({ name, description, type, path }): Promise<NoteSummary> => ({
            name,
            description,
            type,
            path,
            modified: await modifiedAt(path),
          }),
        ),
    );
    const page: MemoryPage = {
      memoryDir: data.memory_dir,
      index: data.index,
      ...paginate(notes, query, {
        text: (n) => [n.name, n.description],
        keys: { name: (n) => n.name, type: (n) => n.type, modified: (n) => n.modified },
      }),
    };
    return c.json(page);
  });

  routes.get('/projects/:id/memory/:note', async (c) => {
    const { notes } = await ctx.dump(c.req.param('id'));
    return c.json(notes.find((n) => n.name === c.req.param('note')) ?? fail(404, 'no such note'));
  });

  return routes;
}
