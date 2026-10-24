import { Hono } from 'hono';
import { paginate } from '../paginate.ts';
import { listQuerySchemas, type ProjectPage } from '../types.ts';
import { listQuery, type RouteContext } from './context.ts';

export function projectRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  routes.get('/projects', async (c) => {
    const query = listQuery(c, listQuerySchemas.projects);
    const page: ProjectPage = paginate(await ctx.projects.list(), query, {
      text: (p) => [p.name],
      keys: { name: (p) => p.name },
    });
    return c.json(page);
  });

  routes.get('/projects/:id', async (c) => c.json(await ctx.project(c.req.param('id'))));

  return routes;
}
