import { FilePlus, FileText, Search } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import { searchNotes } from '@/lib/notes/search';
import type { Folder, Note } from '@/lib/notes/types';
import { cn } from '@/lib/utils';

const MAX_ITEMS = 30;

type Item = { kind: 'open'; note: Note } | { kind: 'create'; title: string };

/** Ctrl/Cmd+O: open a note by title, or create one. Mount it only while open. */
export function QuickSwitcher({
  notes,
  folders,
  onOpen,
  onCreate,
  onClose,
}: {
  notes: readonly Note[];
  folders: readonly Folder[];
  onOpen: (id: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const q = text.trim();
  const found = q
    ? searchNotes(notes, q, folders)
    : notes.filter((n) => !n.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  const items: Item[] = found.slice(0, MAX_ITEMS).map((note) => ({ kind: 'open', note }));
  if (q && !found.some((n) => n.title.toLowerCase() === q.toLowerCase()))
    items.push({ kind: 'create', title: q });

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === 'open') onOpen(item.note.id);
    else onCreate(item.title);
  };

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
      choose(items[active]);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the native dialog closes on Escape, the keyboard path.
    <dialog
      ref={dialog}
      onClose={onClose}
      onMouseDown={onMouseDown}
      onClick={onClick}
      aria-label="Open or create a note"
      className="mx-auto mt-[15vh] w-[min(36rem,calc(100vw-2rem))] bg-transparent p-0 text-foreground backdrop:bg-black/40"
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
            placeholder="Open or create a note"
            maxLength={200}
            aria-label="Note title"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="max-h-[50vh] overflow-auto p-1">
          {items.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No notes yet. Type a title to create one.</li>
          ) : (
            items.map((item, i) => (
              <li key={item.kind === 'open' ? item.note.id : 'create'}>
                <button
                  type="button"
                  ref={i === active ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                  aria-current={i === active || undefined}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm',
                    i === active && 'bg-accent',
                  )}
                >
                  {item.kind === 'open' ? (
                    <>
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{item.note.title}</span>
                    </>
                  ) : (
                    <>
                      <FilePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">Create “{item.title}”</span>
                    </>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </dialog>
  );
}
