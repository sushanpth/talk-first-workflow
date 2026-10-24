import type { UseQueryResult } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { Empty, ErrorBox } from '@/components/query-state';
import type { ChangedFile, FileDiff } from '@/lib/api';
import { cn } from '@/lib/utils';

const DiffView = lazy(() => import('@/components/diff-view'));

export const STATUS: Record<string, { label: string; className: string }> = {
  M: { label: 'modified', className: 'text-amber-600 dark:text-amber-400' },
  A: { label: 'added', className: 'text-green-600 dark:text-green-400' },
  '?': { label: 'untracked', className: 'text-green-600 dark:text-green-400' },
  D: { label: 'deleted', className: 'text-red-600 dark:text-red-400' },
  R: { label: 'renamed', className: 'text-blue-600 dark:text-blue-400' },
  C: { label: 'copied', className: 'text-blue-600 dark:text-blue-400' },
};

export function FileList({
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

/** The selected file's diff, or why there is none. */
export function FileDiffPane({
  query,
  sideBySide,
}: {
  query: UseQueryResult<FileDiff>;
  sideBySide: boolean;
}) {
  if (query.isError) return <ErrorBox error={query.error} />;
  if (!query.data) return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  if (query.data.binary) return <Empty>Binary or very large file; no text diff.</Empty>;
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading editor...</p>}>
      <DiffView
        path={query.data.path}
        original={query.data.original}
        modified={query.data.modified}
        sideBySide={sideBySide}
      />
    </Suspense>
  );
}
