import { Link, useParams } from '@tanstack/react-router';
import { Markdown } from '@/components/markdown';
import { Empty, QueryState } from '@/components/query-state';
import { usePlan, usePlans } from '@/lib/api';

export function PlansPage() {
  const { project } = useParams({ from: '/p/$project/plans' });
  const query = usePlans(project);
  return (
    <QueryState query={query}>
      {(plans) =>
        plans.length === 0 ? (
          <Empty>No saved plans. Plans appear here when a brief is saved at the start gate.</Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {plans.map((plan) => (
              <li key={plan.file}>
                <Link
                  to="/p/$project/plans/$brief"
                  params={{ project, brief: plan.file }}
                  className="block px-4 py-3 hover:bg-accent"
                >
                  <div className="font-medium">{plan.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{plan.file}</div>
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
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
