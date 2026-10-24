import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { Empty, ErrorBox, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type AgentWorktree, type ChangedFile, useFileDiff, useWorktreeDiff, useWorktrees } from '@/lib/api';
import { cn } from '@/lib/utils';

const DiffView = lazy(() => import('@/components/diff-view'));

const STATUS: Record<string, { label: string; className: string }> = {
  M: { label: 'modified', className: 'text-amber-600 dark:text-amber-400' },
  A: { label: 'added', className: 'text-green-600 dark:text-green-400' },
  '?': { label: 'untracked', className: 'text-green-600 dark:text-green-400' },
  D: { label: 'deleted', className: 'text-red-600 dark:text-red-400' },
  R: { label: 'renamed', className: 'text-blue-600 dark:text-blue-400' },
  C: { label: 'copied', className: 'text-blue-600 dark:text-blue-400' },
};

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
  const query = useWorktrees(project);
  return (
    <QueryState query={query}>
      {(trees) =>
        trees.length === 0 ? (
          <Empty>No linked worktrees.</Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {trees.map((t) => (
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
        )
      }
    </QueryState>
  );
}

function FileList({
  files,
  selected,
  onSelect,
}: {
  files: ChangedFile[];
  selected?: string;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="space-y-0.5 text-sm">
      {files.map((f) => {
        const status = STATUS[f.status] ?? { label: f.status, className: '' };
        return (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelect(f.path)}
              title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent',
                f.path === selected && 'bg-accent',
              )}
            >
              <span
                className={cn('w-4 shrink-0 font-mono font-semibold', status.className)}
                title={status.label}
              >
                {f.status}
              </span>
              <span className="truncate font-mono text-xs">{f.path}</span>
            </button>
          </li>
        );
      })}
    </ul>
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
        <div className="space-y-3">
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
            <div className="grid h-[calc(100vh-15rem)] min-h-96 grid-cols-[18rem_1fr] gap-3">
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
