import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { FileList } from '@/components/changed-files';
import { ListView } from '@/components/list-view';
import { Empty, ErrorBox, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type AgentWorktree, useFileDiff, useWorktreeDiff, useWorktrees } from '@/lib/api';
import { useListSearch } from '@/lib/list-search';
import { SORT_KEYS } from '../../../server/types.ts';

const DiffView = lazy(() => import('@/components/diff-view'));

/** Title (the agent's task, else the folder name), branch and agent badges, plan link and path. */
function WorktreeHeading({
  project,
  tree,
  title,
}: {
  project: string;
  tree: AgentWorktree;
  title: ReactNode;
}) {
  const brief = tree.briefPath?.split('/').at(-1);
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {title}
        <Badge variant="secondary" className="font-mono">
          {tree.branch ?? 'detached'}
        </Badge>
        {tree.agentType && (
          <Badge variant="outline" title={tree.agentType}>
            {tree.agentType.split(':').at(-1)}
          </Badge>
        )}
        {brief && (
          // Above the row's stretched link so it stays clickable.
          <Link
            to="/p/$project/plans/$brief"
            params={{ project, brief }}
            className="relative z-10 text-xs underline"
          >
            plan
          </Link>
        )}
      </div>
      <div className="break-all font-mono text-xs text-muted-foreground">{tree.path}</div>
    </div>
  );
}

export function WorktreesPage() {
  const { project } = useParams({ from: '/p/$project/worktrees' });
  const { search, onSearch } = useListSearch('/p/$project/worktrees');
  const query = useWorktrees(project, search);
  return (
    <ListView
      query={query}
      search={search}
      sortKeys={SORT_KEYS.worktrees}
      noun="worktrees"
      onSearch={onSearch}
      empty="No linked worktrees."
    >
      {(page) => (
        <ul className="divide-y rounded-md border">
          {page.items.map((t) => (
            <li key={t.path} className="relative px-4 py-3 hover:bg-accent">
              <WorktreeHeading
                project={project}
                tree={t}
                title={
                  <Link
                    to="/p/$project/worktrees/$name"
                    params={{ project, name: t.name }}
                    className="font-medium after:absolute after:inset-0"
                  >
                    {t.task ?? t.name}
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </ListView>
  );
}

export function WorktreePage() {
  const { project, name } = useParams({ from: '/p/$project/worktrees/$name' });
  const { base, file } = useSearch({ from: '/p/$project/worktrees/$name' });
  const navigate = useNavigate({ from: '/p/$project/worktrees/$name' });
  const [sideBySide, setSideBySide] = useState(true);
  const diff = useWorktreeDiff(project, name, base);
  const selected = file ?? diff.data?.files[0]?.path;
  const fileDiff = useFileDiff(project, name, selected, base);

  return (
    <QueryState query={diff}>
      {(d) => (
        // Fills the window below the one-row header, like the code page.
        <div className="flex h-[calc(100vh-5rem-1px)] flex-col gap-3">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <WorktreeHeading
              project={project}
              tree={d}
              title={<h2 className="text-lg font-semibold">{d.task ?? d.name}</h2>}
            />
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSideBySide((v) => !v)}>
              {sideBySide ? 'Inline view' : 'Side-by-side view'}
            </Button>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            base {d.base.slice(0, 10)} {base ? '(given)' : '(merge-base with the main checkout)'}
          </p>
          {d.files.length === 0 ? (
            <Empty>No changes against the base.</Empty>
          ) : (
            <div className="grid min-h-96 flex-1 grid-cols-[18rem_1fr] gap-3">
              <aside className="overflow-auto rounded-md border p-2" data-section="changed-files">
                <FileList
                  files={d.files}
                  selected={selected}
                  onSelect={(path) => navigate({ search: (prev) => ({ ...prev, file: path }) })}
                />
              </aside>
              <section className="min-w-0 overflow-hidden rounded-md border" data-section="diff">
                {fileDiff.isError ? (
                  <ErrorBox error={fileDiff.error} />
                ) : !fileDiff.data ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading...</p>
                ) : fileDiff.data.binary ? (
                  <Empty>Binary or very large file; no text diff.</Empty>
                ) : (
                  <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading editor...</p>}>
                    <DiffView
                      path={fileDiff.data.path}
                      original={fileDiff.data.original}
                      modified={fileDiff.data.modified}
                      sideBySide={sideBySide}
                    />
                  </Suspense>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </QueryState>
  );
}
