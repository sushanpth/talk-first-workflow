import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCodeTree } from '@/lib/code-api';
import { cn } from '@/lib/utils';

/** "a/b/c.ts" -> ["a", "a/b"] */
function foldersAbove(path: string | undefined): string[] {
  const parts = path?.split('/').slice(0, -1) ?? [];
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

const indent = (depth: number) => ({ paddingLeft: `${depth * 0.75 + 0.25}rem` });

interface LevelProps {
  project: string;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  current?: string;
}

/** One folder's entries, fetched only once the folder is open. */
function TreeLevel({ project, path, depth, expanded, onToggle, current }: LevelProps) {
  const query = useCodeTree(project, path);
  if (query.isPending || query.isError) {
    return (
      <p style={indent(depth)} className="py-1 text-xs text-muted-foreground">
        {query.isError ? query.error.message : 'Loading...'}
      </p>
    );
  }
  if (depth === 0 && query.data.entries.length === 0) {
    return <p className="p-2 text-xs text-muted-foreground">No tracked files.</p>;
  }
  return (
    <ul>
      {query.data.entries.map((entry) => {
        if (entry.type === 'file') {
          const isCurrent = entry.path === current;
          return (
            <li key={entry.path}>
              <Link
                to="/p/$project/code/$"
                params={{ project, _splat: entry.path }}
                style={indent(depth + 1)}
                className={cn(
                  'block truncate rounded py-0.5 pr-2 font-mono text-xs hover:bg-accent',
                  isCurrent && 'bg-accent font-semibold',
                )}
                title={entry.path}
              >
                {entry.name}
              </Link>
            </li>
          );
        }
        const open = expanded.has(entry.path);
        const Chevron = open ? ChevronDown : ChevronRight;
        return (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => onToggle(entry.path)}
              aria-expanded={open}
              style={indent(depth)}
              className="flex w-full items-center gap-1 rounded py-0.5 pr-2 text-left font-mono text-xs hover:bg-accent"
              title={entry.path}
            >
              <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{entry.name}</span>
            </button>
            {open && (
              <TreeLevel
                project={project}
                path={entry.path}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                current={current}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Lazy file tree; lives in the code layout so open folders survive moving between files. */
export function CodeTree({ project, current }: { project: string; current?: string }) {
  const [expanded, setExpanded] = useState(() => new Set<string>());
  // A file opened by link or quick open gets its folders opened too.
  useEffect(() => {
    setExpanded((prev) => {
      const missing = foldersAbove(current).filter((dir) => !prev.has(dir));
      return missing.length === 0 ? prev : new Set([...prev, ...missing]);
    });
  }, [current]);
  const onToggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  return (
    <TreeLevel
      project={project}
      path=""
      depth={0}
      expanded={expanded}
      onToggle={onToggle}
      current={current}
    />
  );
}
