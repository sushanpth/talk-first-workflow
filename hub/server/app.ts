import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ProjectStore } from './projects.ts';
import { codeRoutes } from './routes/code.ts';
import { compareRoutes } from './routes/compare.ts';
import { routeContext } from './routes/context.ts';
import { docRoutes } from './routes/docs.ts';
import { memoryRoutes } from './routes/memory.ts';
import { planRoutes } from './routes/plans.ts';
import { projectRoutes } from './routes/projects.ts';
import { resolveRoutes } from './routes/resolve.ts';
import { staticRoutes } from './routes/static.ts';
import { worktreeRoutes } from './routes/worktrees.ts';
import { guard, helloProof, NONCE, requireAuth } from './security.ts';
import { HUB_APP } from './state.ts';

export interface AppOptions {
  token: string;
  port: () => number;
  projects: ProjectStore;
  dist: string;
  /** Reported by /api/hello and /api/health so a launcher can tell which hub holds the port. */
  version: string;
  build: string;
  onActivity?: () => void;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  // Every API route lives on this sub-app, behind its auth middleware: deny by default.
  const api = new Hono();

  app.use(guard({ token: options.token, port: options.port }));
  api.use(requireAuth(options.token, options.onActivity));

  const onError: ErrorHandler = (err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    return c.json({ error: err.message }, 500);
  };
  app.onError(onError);
  api.onError(onError);

  const hubInfo = () => ({
    ok: true,
    app: HUB_APP,
    pid: process.pid,
    version: options.version,
    build: options.build,
  });
  // The one unauthenticated API route: the launcher must know it's our hub before it sends the token.
  app.get('/api/hello', (c) => {
    const nonce = c.req.query('nonce') ?? '';
    if (!NONCE.test(nonce)) return c.json({ error: 'bad nonce' }, 400);
    return c.json({ ...hubInfo(), proof: helloProof(options.token, options.port(), nonce) });
  });
  api.get('/health', (c) => c.json(hubInfo()));

  const ctx = routeContext(options.projects);
  for (const routes of [
    projectRoutes(ctx),
    planRoutes(ctx),
    memoryRoutes(ctx),
    docRoutes(ctx),
    worktreeRoutes(ctx),
    resolveRoutes(ctx),
    codeRoutes(ctx),
    compareRoutes(ctx),
  ]) {
    api.route('/', routes);
  }

  api.all('*', (c) => c.json({ error: 'not found' }, 404));
  app.route('/api', api);
  app.route('/', staticRoutes(options.dist));

  return app;
}
