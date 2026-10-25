import { Link } from '@tanstack/react-router';
import {
  CalendarDays,
  Folder,
  FolderPlus,
  Hash,
  Notebook,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { FolderRow } from '@/lib/notes/model';
import { cn } from '@/lib/utils';
import { DELETED_VIEW, type NotesSearch } from './view';

const rowClass = (active: boolean) =>
  cn(
    'flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent',
    active && 'bg-accent font-medium',
  );

function Count({ n }: { n: number }) {
  return <span className="ml-auto text-xs text-muted-foreground tabular-nums">{n}</span>;
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex items-center px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
      <span className="ml-auto">{action}</span>
    </div>
  );
}

const iconButton = 'rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground';

function FolderName({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [text, setText] = useState(name);
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: shown right after the user asks to rename.
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => onDone(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(text);
        if (e.key === 'Escape') onDone(null);
      }}
      maxLength={100}
      aria-label="Folder name"
      className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-sm outline-none"
    />
  );
}

export function NotesSidebar({
  view,
  folders,
  tags,
  counts,
  editingFolder,
  onEditFolder,
  onDaily,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onCollapse,
}: {
  view: NotesSearch;
  folders: readonly FolderRow[];
  tags: readonly [string, number][];
  counts: { all: number; deleted: number; folders: Map<string, number> };
  editingFolder: string | undefined;
  onEditFolder: (id: string | undefined) => void;
  onDaily: () => void;
  onNewFolder: (parentId?: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string, name: string) => void;
  onCollapse: () => void;
}) {
  const all = !view.folder && !view.tag;
  return (
    <nav aria-label="Notes folders" className="p-2">
      <div className="mb-1 flex justify-end">
        <button type="button" onClick={onCollapse} className={iconButton} aria-label="Collapse sidebar">
          <PanelLeftClose className="size-4" aria-hidden />
        </button>
      </div>
      <Link to="/notes" search={{}} className={rowClass(all)}>
        <Notebook className="size-4 shrink-0" aria-hidden />
        All Notes
        <Count n={counts.all} />
      </Link>
      <button type="button" onClick={onDaily} className={cn(rowClass(false), 'w-full')}>
        <CalendarDays className="size-4 shrink-0" aria-hidden />
        Daily note
      </button>

      <SectionTitle
        action={
          <button type="button" onClick={() => onNewFolder()} className={iconButton} aria-label="New folder">
            <FolderPlus className="size-3.5" aria-hidden />
          </button>
        }
      >
        Folders
      </SectionTitle>
      {folders.length === 0 && <p className="px-2 text-xs text-muted-foreground">No folders.</p>}
      <ul>
        {folders.map(({ folder, depth }) => (
          <li
            key={folder.id}
            className="group flex items-center"
            style={{ paddingLeft: `${depth * 0.75}rem` }}
          >
            {editingFolder === folder.id ? (
              <FolderName
                name={folder.name}
                onDone={(name) => {
                  if (name !== null) onRenameFolder(folder.id, name);
                  onEditFolder(undefined);
                }}
              />
            ) : (
              <>
                <Link
                  to="/notes"
                  search={{ folder: folder.id }}
                  className={rowClass(view.folder === folder.id)}
                >
                  <Folder className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{folder.name}</span>
                  <Count n={counts.folders.get(folder.id) ?? 0} />
                </Link>
                <span className="hidden shrink-0 group-focus-within:flex group-hover:flex">
                  <button
                    type="button"
                    onClick={() => onNewFolder(folder.id)}
                    className={iconButton}
                    aria-label={`New folder in ${folder.name}`}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditFolder(folder.id)}
                    className={iconButton}
                    aria-label={`Rename ${folder.name}`}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFolder(folder.id, folder.name)}
                    className={iconButton}
                    aria-label={`Delete ${folder.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <SectionTitle>Tags</SectionTitle>
      {tags.length === 0 && <p className="px-2 text-xs text-muted-foreground">No tags.</p>}
      <ul>
        {tags.map(([tag, n]) => (
          <li key={tag} className="flex">
            <Link to="/notes" search={{ tag }} className={rowClass(view.tag === tag)}>
              <Hash className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{tag}</span>
              <Count n={n} />
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex">
        <Link
          to="/notes"
          search={{ folder: DELETED_VIEW }}
          className={rowClass(view.folder === DELETED_VIEW)}
        >
          <Trash2 className="size-4 shrink-0" aria-hidden />
          Recently Deleted
          <Count n={counts.deleted} />
        </Link>
      </div>
    </nav>
  );
}

const railItem = (active: boolean) =>
  cn(
    'flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground',
    active && 'bg-accent text-foreground',
  );

/** The collapsed sidebar: icons only; folders and tags open the full sidebar. */
export function NotesRail({
  view,
  onDaily,
  onExpand,
}: {
  view: NotesSearch;
  onDaily: () => void;
  onExpand: () => void;
}) {
  const inTrash = view.folder === DELETED_VIEW;
  return (
    <nav aria-label="Notes folders" className="flex h-full flex-col items-center gap-1 py-2">
      <button
        type="button"
        onClick={onExpand}
        className={railItem(false)}
        aria-label="Expand sidebar"
        title="Expand sidebar"
      >
        <PanelLeftOpen className="size-4" aria-hidden />
      </button>
      <Link
        to="/notes"
        search={{}}
        className={railItem(!view.folder && !view.tag)}
        aria-label="All Notes"
        title="All Notes"
      >
        <Notebook className="size-4" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={onDaily}
        className={railItem(false)}
        aria-label="Daily note"
        title="Daily note"
      >
        <CalendarDays className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onExpand}
        className={railItem(!!view.folder && !inTrash)}
        aria-label="Folders"
        title="Folders"
      >
        <Folder className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onExpand}
        className={railItem(!!view.tag)}
        aria-label="Tags"
        title="Tags"
      >
        <Hash className="size-4" aria-hidden />
      </button>
      <Link
        to="/notes"
        search={{ folder: DELETED_VIEW }}
        className={cn(railItem(inTrash), 'mt-auto')}
        aria-label="Recently Deleted"
        title="Recently Deleted"
      >
        <Trash2 className="size-4" aria-hidden />
      </Link>
    </nav>
  );
}
