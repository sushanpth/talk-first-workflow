import type { ChangedFile } from '@/lib/api';
import { cn } from '@/lib/utils';

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
