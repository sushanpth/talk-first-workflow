import { createRootRoute, createRoute, createRouter, Link, Outlet, redirect } from '@tanstack/react-router';
import { parseListSearch, parseMemorySearch } from '@/lib/list-search';
import { DocPage, DocsPage } from '@/routes/docs';
import { MemoryPage, NotePage } from '@/routes/memory';
import { PlanPage, PlansPage } from '@/routes/plans';
import { ProjectLayout, ProjectsPage } from '@/routes/projects';
import { WorktreePage, WorktreesPage } from '@/routes/worktrees';

function RootLayout() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-4">
      <header className="mb-6 flex items-center gap-4 border-b pb-3">
        <Link to="/" className="font-semibold">
          talk-first hub
        </Link>
        <span className="text-xs text-muted-foreground">read-only</span>
      </header>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProjectsPage,
  validateSearch: (search: Record<string, unknown>) => parseListSearch('projects', search),
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$project',
  component: ProjectLayout,
});
const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/p/$project/plans', params });
  },
});
const plansRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/plans',
  component: PlansPage,
  validateSearch: (search: Record<string, unknown>) => parseListSearch('plans', search),
});
const planRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/plans/$brief',
  component: PlanPage,
});
const memoryRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/memory',
  component: MemoryPage,
  validateSearch: parseMemorySearch,
});
const noteRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/memory/$note',
  component: NotePage,
});
const docsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/docs',
  component: DocsPage,
  validateSearch: (search: Record<string, unknown>) => parseListSearch('docs', search),
});
const docRoute = createRoute({ getParentRoute: () => projectRoute, path: '/docs/$', component: DocPage });
const worktreesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/worktrees',
  component: WorktreesPage,
  validateSearch: (search: Record<string, unknown>) => parseListSearch('worktrees', search),
});
const worktreeRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/worktrees/$name',
  component: WorktreePage,
  validateSearch: (search: Record<string, unknown>): { base?: string; file?: string } => ({
    base: typeof search.base === 'string' ? search.base : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([
    projectIndexRoute,
    plansRoute,
    planRoute,
    memoryRoute,
    noteRoute,
    docsRoute,
    docRoute,
    worktreesRoute,
    worktreeRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
