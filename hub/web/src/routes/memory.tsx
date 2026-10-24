import { Link, useParams } from '@tanstack/react-router';
import { FilterChips, ListView } from '@/components/list-view';
import { Markdown } from '@/components/markdown';
import { Empty, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemory, useNote } from '@/lib/api';
import { useListSearch } from '@/lib/list-search';
import { formatDate } from '@/lib/utils';
import { MEMORY_TYPES, type MemoryPage as MemoryPageData, SORT_KEYS } from '../../../server/types.ts';

const fileName = (path: string) => path.split('/').pop() ?? path;

function IndexCard({ project, memory }: { project: string; memory: MemoryPageData }) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Index (MEMORY.md)</CardTitle>
        <p className="break-all font-mono text-xs text-muted-foreground">{memory.memoryDir}</p>
      </CardHeader>
      <CardContent>
        {memory.index ? (
          <Markdown
            text={memory.index}
            project={project}
            renderLink={(href, children) => {
              const file = fileName(href);
              if (!file.endsWith('.md')) return null;
              // The page holds only some notes; notes are saved as `<name>.md`, so the stem stands in.
              const name = memory.items.find((n) => fileName(n.path) === file)?.name ?? file.slice(0, -3);
              return (
                <Link to="/p/$project/memory/$note" params={{ project, note: name }}>
                  {children}
                </Link>
              );
            }}
          />
        ) : (
          <Empty>No index file.</Empty>
        )}
      </CardContent>
    </Card>
  );
}

export function MemoryPage() {
  const { project } = useParams({ from: '/p/$project/memory' });
  const { search, onSearch } = useListSearch('/p/$project/memory');
  const query = useMemory(project, search);
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold">Notes</h2>
        <ListView
          query={query}
          search={search}
          sortKeys={SORT_KEYS.memory}
          noun="notes"
          onSearch={onSearch}
          filters={
            <FilterChips
              label="Note type"
              options={MEMORY_TYPES}
              value={search.type}
              onChange={(type) => onSearch({ type })}
            />
          }
          filtered={search.type !== undefined}
          empty="No notes yet."
        >
          {(page) => (
            <ul className="divide-y rounded-md border">
              {page.items.map((n) => (
                <li key={n.path}>
                  <Link
                    to="/p/$project/memory/$note"
                    params={{ project, note: n.name }}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{n.name}</div>
                      <div className="text-sm text-muted-foreground">{n.description}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {n.type && <Badge variant="secondary">{n.type}</Badge>}
                      {n.modified && (
                        <time
                          dateTime={n.modified}
                          title={n.modified}
                          className="text-xs text-muted-foreground"
                        >
                          {formatDate(n.modified)}
                        </time>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ListView>
      </section>
      {query.data && <IndexCard project={project} memory={query.data} />}
    </div>
  );
}

export function NotePage() {
  const { project, note } = useParams({ from: '/p/$project/memory/$note' });
  const query = useNote(project, note);
  return (
    <QueryState query={query}>
      {(n) => (
        <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
          <article className="min-w-0 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{n.name}</h2>
                {n.type && <Badge variant="secondary">{n.type}</Badge>}
              </div>
              <p className="text-muted-foreground">{n.description}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{n.path}</p>
            </div>
            <Markdown text={n.body} project={project} links={n.links} />
          </article>
          <aside className="space-y-4">
            <Card data-section="links">
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardContent>
                {n.links.length === 0 ? (
                  <Empty>None.</Empty>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {n.links.map((l) =>
                      l.name ? (
                        <li key={l.target}>
                          <Link
                            to="/p/$project/memory/$note"
                            params={{ project, note: l.name }}
                            className="underline"
                          >
                            {l.target}
                          </Link>
                        </li>
                      ) : (
                        <li key={l.target} className="text-muted-foreground line-through">
                          {l.target}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card data-section="backlinks">
              <CardHeader>
                <CardTitle>Backlinks</CardTitle>
              </CardHeader>
              <CardContent>
                {n.backlinks.length === 0 ? (
                  <Empty>No notes link here.</Empty>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {n.backlinks.map((name) => (
                      <li key={name}>
                        <Link
                          to="/p/$project/memory/$note"
                          params={{ project, note: name }}
                          className="underline"
                        >
                          {name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </QueryState>
  );
}
