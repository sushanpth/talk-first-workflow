import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { ProjectSwitcher } from '@/components/project-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { parseListSearch, parseMemorySearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';
import {
  CodeFilePage,
  CodeIndexPage,
  CodeLayout,
  CodeSearchPage,
  ComparePage,
  parseCodeFileSearch,
  parseCodeSearch,
  parseCompareSearch,
} from '@/routes/code';
import { DocPage, DocsPage } from '@/routes/docs';
import { MemoryPage, NotePage } from '@/routes/memory';
import { PlanPage, PlansPage } from '@/routes/plans';
import { ProjectLayout, ProjectsPage, SECTIONS } from '@/routes/projects';
import { WorktreePage, WorktreesPage } from '@/routes/worktrees';

function RootLayout() {
  const { project } = useParams({ strict: false });
  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-12 max-w-7xl items-stretch gap-3 px-6">
          <Link to="/" className="flex shrink-0 items-center font-semibold">
            talk-first hub
          </Link>
          {project && (
            <>
              <span aria-hidden className="flex items-center text-muted-foreground">
                /
              </span>
              <ProjectSwitcher project={project} />
              {/* Scrolls sideways on narrow screens so the header stays one row. */}
              <nav className="-mb-px flex min-w-0 overflow-x-auto">
                {SECTIONS.map((s) => (
                  <Link
                    key={s.to}
                    to={s.to}
                    params={{ project }}
                    className="flex shrink-0 items-center border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground"
                    activeProps={{ className: cn('border-foreground! text-foreground!') }}
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">read-only</span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-4">
        <Outlet />
      </main>
    </>
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
// Nested on purpose: as flat siblings, the `/docs/$` splat also matches `/docs` and wins.
const docsRoute = createRoute({ getParentRoute: () => projectRoute, path: '/docs' });
const docsIndexRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: '/',
  component: DocsPage,
  validateSearch: (search: Record<string, unknown>) => parseListSearch('docs', search),
});
const docRoute = createRoute({ getParentRoute: () => docsRoute, path: '$', component: DocPage });
// Nested like docs; the static `/search` and `/compare` outrank the `$` file splat.
const codeRoute = createRoute({ getParentRoute: () => projectRoute, path: '/code', component: CodeLayout });
const codeIndexRoute = createRoute({ getParentRoute: () => codeRoute, path: '/', component: CodeIndexPage });
const codeSearchRoute = createRoute({
  getParentRoute: () => codeRoute,
  path: '/search',
  component: CodeSearchPage,
  validateSearch: parseCodeSearch,
});
const codeCompareRoute = createRoute({
  getParentRoute: () => codeRoute,
  path: '/compare',
  component: ComparePage,
  validateSearch: parseCompareSearch,
});
const codeFileRoute = createRoute({
  getParentRoute: () => codeRoute,
  path: '$',
  component: CodeFilePage,
  validateSearch: parseCodeFileSearch,
});
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
    docsRoute.addChildren([docsIndexRoute, docRoute]),
    codeRoute.addChildren([codeIndexRoute, codeSearchRoute, codeCompareRoute, codeFileRoute]),
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
