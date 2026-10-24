import { Link, Outlet, useParams } from '@tanstack/react-router';
import { ListView } from '@/components/list-view';
import { QueryState } from '@/components/query-state';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProject, useProjects } from '@/lib/api';
import { useListSearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';
import { SORT_KEYS } from '../../../server/types.ts';

const SECTIONS = [
  { to: '/p/$project/plans', label: 'Plans' },
  { to: '/p/$project/memory', label: 'Memory' },
  { to: '/p/$project/docs', label: 'Docs' },
  { to: '/p/$project/worktrees', label: 'Worktrees' },
] as const;

export function ProjectsPage() {
  const { search, onSearch } = useListSearch('/');
  const query = useProjects(search);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <ListView
        query={query}
        search={search}
        sortKeys={SORT_KEYS.projects}
        noun="projects"
        onSearch={onSearch}
        empty="No projects yet. Set up memory in a repo, or open the hub from one."
      >
        {(page) => (
          <div className="grid gap-4 md:grid-cols-2">
            {page.items.map((p) => (
              <Card key={p.id} data-project={p.id}>
                <CardHeader>
                  <CardTitle>
                    <Link to="/p/$project/plans" params={{ project: p.id }} className="hover:underline">
                      {p.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="break-all font-mono text-xs">
                    {p.repo ?? 'repo not found on disk'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {p.briefCount} plans · {p.noteCount} notes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SECTIONS.map((s) => (
                      <Link
                        key={s.to}
                        to={s.to}
                        params={{ project: p.id }}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ListView>
    </div>
  );
}

export function ProjectLayout() {
  const { project } = useParams({ from: '/p/$project' });
  const query = useProject(project);
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{query.data?.name ?? project}</h1>
        <nav className="flex gap-1 border-b">
          {SECTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              params={{ project }}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: cn('border-foreground! text-foreground!') }}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>
      {query.isError ? <QueryState query={query}>{() => null}</QueryState> : <Outlet />}
    </div>
  );
}
