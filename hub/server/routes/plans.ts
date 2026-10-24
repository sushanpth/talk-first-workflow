import { Hono } from 'hono';
import { paginate } from '../paginate.ts';
import { listQuerySchemas, type PlanPage, type PlanSummary } from '../types.ts';
import { fail, listQuery, type RouteContext } from './context.ts';

const DATE_RE = /^(\d{4}-\d{2}-\d{2})(?!\d)/;

export function planRoutes(ctx: RouteContext): Hono {
  const routes = new Hono();

  routes.get('/projects/:id/plans', async (c) => {
    const query = listQuery(c, listQuerySchemas.plans);
    const { briefs } = await ctx.dump(c.req.param('id'));
    const plans = briefs.map(
      ({ file, title, path }): PlanSummary => ({ file, title, path, date: DATE_RE.exec(file)?.[1] ?? null }),
    );
    const page: PlanPage = paginate(plans, query, {
      text: (p) => [p.title, p.file],
      keys: { date: (p) => p.date, title: (p) => p.title },
    });
    return c.json(page);
  });

  routes.get('/projects/:id/plans/:file', async (c) => {
    const { briefs } = await ctx.dump(c.req.param('id'));
    return c.json(briefs.find((b) => b.file === c.req.param('file')) ?? fail(404, 'no such plan'));
  });

  return routes;
}
