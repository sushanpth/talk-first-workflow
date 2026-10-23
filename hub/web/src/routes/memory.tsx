import { Link, useParams } from '@tanstack/react-router';
import { Markdown } from '@/components/markdown';
import { Empty, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemory, useNote } from '@/lib/api';

const fileName = (path: string) => path.split('/').pop() ?? path;

export function MemoryPage() {
  const { project } = useParams({ from: '/p/$project/memory' });
  const query = useMemory(project);
  return (
    <QueryState query={query}>
      {(memory) => (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Notes</h2>
            {memory.notes.length === 0 ? (
              <Empty>No notes yet.</Empty>
            ) : (
              <ul className="divide-y rounded-md border">
                {memory.notes.map((n) => (
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
                      {n.type && <Badge variant="secondary">{n.type}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
                    const note = memory.notes.find((n) => fileName(n.path) === fileName(href));
                    return note ? (
                      <Link to="/p/$project/memory/$note" params={{ project, note: note.name }}>
                        {children}
                      </Link>
                    ) : null;
                  }}
                />
              ) : (
                <Empty>No index file.</Empty>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </QueryState>
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
