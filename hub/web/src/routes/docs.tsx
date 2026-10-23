import { Link, useParams } from '@tanstack/react-router';
import { Markdown } from '@/components/markdown';
import { Empty, QueryState } from '@/components/query-state';
import { useDoc, useDocs } from '@/lib/api';

/** Resolves a relative link against the doc's folder, e.g. ("docs/a.md", "../README.md") -> "README.md". */
function resolveRelative(from: string, href: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const piece of href.split('#')[0]?.split('/') ?? []) {
    if (piece === '..') parts.pop();
    else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

export function DocsPage() {
  const { project } = useParams({ from: '/p/$project/docs' });
  const query = useDocs(project);
  return (
    <QueryState query={query}>
      {(docs) =>
        docs.length === 0 ? (
          <Empty>No tracked markdown files.</Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {docs.map((path) => (
              <li key={path}>
                <Link
                  to="/p/$project/docs/$"
                  params={{ project, _splat: path }}
                  className="block px-4 py-2 font-mono text-sm hover:bg-accent"
                >
                  {path}
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

export function DocPage() {
  const { project, _splat: path = '' } = useParams({ from: '/p/$project/docs/$' });
  const query = useDoc(project, path);
  const docs = useDocs(project);
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
              return docs.data?.includes(target) ? (
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
