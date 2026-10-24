import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ListView } from '@/components/list-view';
import { Markdown } from '@/components/markdown';
import { QueryState } from '@/components/query-state';
import { useDoc, useDocs } from '@/lib/api';
import { patchSearch } from '@/lib/list-search';
import { formatDate } from '@/lib/utils';
import { SORT_KEYS } from '../../../server/types.ts';

/** Resolves a relative link against the doc's folder, e.g. ("docs/a.md", "../README.md") -> "README.md"; null above the repo. */
function resolveRelative(from: string, href: string): string | null {
  const parts = from.split('/').slice(0, -1);
  for (const piece of href.split('#')[0]?.split('/') ?? []) {
    if (piece === '..') {
      if (parts.pop() === undefined) return null;
    } else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

export function DocsPage() {
  const { project } = useParams({ from: '/p/$project/docs' });
  const search = useSearch({ from: '/p/$project/docs' });
  const navigate = useNavigate({ from: '/p/$project/docs' });
  const query = useDocs(project, search);
  return (
    <ListView
      query={query}
      search={search}
      sortKeys={SORT_KEYS.docs}
      noun="docs"
      onSearch={(patch) => navigate({ search: (prev) => patchSearch(prev, patch), replace: 'q' in patch })}
      empty="No tracked markdown files."
    >
      {(page) => (
        <ul className="divide-y rounded-md border">
          {page.items.map((doc) => (
            <li key={doc.path}>
              <Link
                to="/p/$project/docs/$"
                params={{ project, _splat: doc.path }}
                className="flex items-baseline gap-3 px-4 py-2 hover:bg-accent"
              >
                <span className="min-w-0 flex-1 break-all font-mono text-sm">{doc.path}</span>
                {doc.modified && (
                  <time
                    dateTime={doc.modified}
                    title={doc.modified}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatDate(doc.modified)}
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

export function DocPage() {
  const { project, _splat: path = '' } = useParams({ from: '/p/$project/docs/$' });
  const query = useDoc(project, path);
  return (
    <QueryState query={query}>
      {(doc) => (
        <article className="space-y-4">
          <p className="font-mono text-xs text-muted-foreground">{doc.path}</p>
          <Markdown
            text={doc.text}
            project={project}
            renderLink={(href, children) => {
              const target = resolveRelative(doc.path, href);
              // Docs are tracked `*.md` files; the doc page reports any that aren't.
              return target?.endsWith('.md') ? (
                <Link to="/p/$project/docs/$" params={{ project, _splat: target }}>
                  {children}
                </Link>
              ) : null;
            }}
          />
        </article>
      )}
    </QueryState>
  );
}
