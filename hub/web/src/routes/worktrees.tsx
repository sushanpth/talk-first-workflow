import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { Empty, ErrorBox, QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { type ChangedFile, useFileDiff, useWorktreeDiff, useWorktrees } from '@/lib/api';
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
              <li key={t.path}>
                <Link
                  to="/p/$project/worktrees/$name"
                  params={{ project, name: t.name }}
                  className="block px-4 py-3 hover:bg-accent"
                >
                  <div className="font-medium">
                    {t.name} <span className="text-sm text-muted-foreground">{t.branch ?? 'detached'}</span>
                  </div>
                  <div className="break-all font-mono text-xs text-muted-foreground">{t.path}</div>
                </Link>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium">{d.branch ?? 'detached'}</span>
            <span className="font-mono text-xs text-muted-foreground">
              base {d.base.slice(0, 10)} {base ? '(given)' : '(merge-base with the main checkout)'}
            </span>
            <span className="break-all font-mono text-xs text-muted-foreground">{d.path}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSideBySide((v) => !v)}>
              {sideBySide ? 'Inline view' : 'Side-by-side view'}
            </Button>
          </div>
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
