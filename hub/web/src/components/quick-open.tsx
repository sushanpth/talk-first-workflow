import { useNavigate } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { useCodeFiles } from '@/lib/code-api';
import { cn } from '@/lib/utils';

const QUERY_DEBOUNCE_MS = 200;

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Ctrl/Cmd+P file finder. Mount it only while open, so each opening starts empty. */
export function QuickOpen({ project, onClose }: { project: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim(), QUERY_DEBOUNCE_MS);
  const query = useCodeFiles(project, q);
  const items = query.data?.items ?? [];

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const open = (path: string | undefined) => {
    if (path === undefined) return;
    onClose();
    navigate({ to: '/p/$project/code/$', params: { project, _splat: path } });
  };

  // The wrapper fills the dialog and carries its border, so only the backdrop targets the dialog. Requiring
  // the press to start there too keeps a text-select drag out of the input from closing it.
  const pressedBackdrop = useRef(false);
  const onMouseDown = (e: MouseEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = e.target === e.currentTarget;
  };
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (items.length === 0 ? 0 : (i + step + items.length) % items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(items[active]?.path);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the native dialog closes on Escape, the keyboard path.
    <dialog
      ref={dialog}
      onClose={onClose}
      onMouseDown={onMouseDown}
      onClick={onClick}
      aria-label="Go to file"
      className="mx-auto mt-[15vh] w-[min(40rem,calc(100vw-2rem))] bg-transparent p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="rounded-lg border bg-background shadow-lg">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Go to file by name"
            maxLength={200}
            aria-label="File name"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-auto p-1">
          {query.isError ? (
            <li className="p-3 text-sm text-destructive">{query.error.message}</li>
          ) : query.isPending ? (
            <li className="p-3 text-sm text-muted-foreground">Loading...</li>
          ) : items.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No matching files.</li>
          ) : (
            items.map((item, i) => (
              <li key={item.path}>
                <button
                  type="button"
                  ref={i === active ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                  aria-current={i === active || undefined}
                  onMouseMove={() => setActive(i)}
                  onClick={() => open(item.path)}
                  className={cn(
                    'block w-full truncate rounded px-3 py-1.5 text-left font-mono text-xs',
                    i === active && 'bg-accent',
                  )}
                >
                  {item.path}
                </button>
              </li>
            ))
          )}
        </ul>
        {query.data && query.data.total > items.length && (
          <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            {items.length} of {query.data.total}; type more to narrow.
          </p>
        )}
      </div>
    </dialog>
  );
}
