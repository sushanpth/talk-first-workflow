import { Link, useParams } from '@tanstack/react-router';
import { ListView } from '@/components/list-view';
import { Markdown } from '@/components/markdown';
import { QueryState } from '@/components/query-state';
import { usePlan, usePlans } from '@/lib/api';
import { useListSearch } from '@/lib/list-search';
import { formatDate } from '@/lib/utils';
import { SORT_KEYS } from '../../../server/types.ts';

export function PlansPage() {
  const { project } = useParams({ from: '/p/$project/plans' });
  const { search, onSearch } = useListSearch('/p/$project/plans');
  const query = usePlans(project, search);
  return (
    <ListView
      query={query}
      search={search}
      sortKeys={SORT_KEYS.plans}
      noun="plans"
      onSearch={onSearch}
      empty="No saved plans. Plans appear here when a brief is saved at the start gate."
    >
      {(page) => (
        <ul className="divide-y rounded-md border">
          {page.items.map((plan) => (
            <li key={plan.file}>
              <Link
                to="/p/$project/plans/$brief"
                params={{ project, brief: plan.file }}
                className="flex items-start gap-3 px-4 py-3 hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{plan.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{plan.file}</div>
                </div>
                {plan.date && (
                  <time dateTime={plan.date} className="shrink-0 text-sm text-muted-foreground">
                    {formatDate(plan.date)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ListView>
  );
}

export function PlanPage() {
  const { project, brief } = useParams({ from: '/p/$project/plans/$brief' });
  const query = usePlan(project, brief);
  return (
    <QueryState query={query}>
      {(plan) => (
        <article className="space-y-4">
          <p className="break-all font-mono text-xs text-muted-foreground">{plan.path}</p>
          <Markdown text={plan.body} project={project} links={plan.links} />
        </article>
      )}
    </QueryState>
  );
}
