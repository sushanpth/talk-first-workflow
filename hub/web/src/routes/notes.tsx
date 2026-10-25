import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  ArrowLeft,
  BookOpen,
  Download,
  FolderTree,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';
import NoteEditor from '@/components/notes/editor';
import { useAttachmentUrls, useMemoryNames, useNotesData } from '@/components/notes/hooks';
import { NoteList } from '@/components/notes/note-list';
import { NotePanel } from '@/components/notes/note-panel';
import { QuickSwitcher } from '@/components/notes/quick-switcher';
import { NotesSidebar } from '@/components/notes/sidebar';
import { DELETED_VIEW } from '@/components/notes/view';
import { Button } from '@/components/ui/button';
import { useAllProjects } from '@/lib/api';
import { backupEntries, exportNotes, importBackup } from '@/lib/notes/backup';
import {
  type DateGroup,
  dailyTitle,
  daysLeft,
  folderTree,
  groupByDate,
  linkedMentions,
  linkMention,
  outline,
  parseLinkText,
  resolveLink,
  toggleTask,
  unlinkedMentions,
} from '@/lib/notes/model';
import { searchNotes } from '@/lib/notes/search';
import { DebouncedSaver, KEEP_DELETED_DAYS, notesStore, requestPersistence } from '@/lib/notes/store';
import { type EditorProps, type LinkTarget, NO_FOLDER, type Note } from '@/lib/notes/types';
import { useIsDark } from '@/lib/theme';
import { cn } from '@/lib/utils';

let started = false;

const iconButton = (label: string, onClick: () => void, icon: ReactNode, pressed?: boolean) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClick}
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    className="px-2"
  >
    {icon}
  </Button>
);

const selectClass = 'h-8 max-w-40 rounded-md border bg-background px-2 text-sm';

function downloadBytes(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function HostNotice() {
  // Each address is its own browser origin, with its own IndexedDB.
  if (typeof window === 'undefined' || window.location.hostname === '127.0.0.1') return null;
  return (
    <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm">
      Notes are stored in this browser per address; open the hub at 127.0.0.1 to see the notes kept there.
    </p>
  );
}

export function NotesPage() {
  const store = useMemo(notesStore, []);
  const { id } = useParams({ strict: false });
  const view = useSearch({ from: '/notes' });
  const navigate = useNavigate();
  const dark = useIsDark();
  const { notes, folders } = useNotesData(store);
  const { resolve, retryMissing } = useAttachmentUrls(store);
  const projects = useAllProjects().data?.items ?? [];
  const saver = useMemo(() => new DebouncedSaver((nid, body) => store.save(nid, body)), [store]);

  const [draft, setDraft] = useState<{ id: string; body: string }>();
  const [reading, setReading] = useState(false);
  const [focusId, setFocusId] = useState<string>();
  const [switcher, setSwitcher] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [editingFolder, setEditingFolder] = useState<string>();
  const [status, setStatus] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started) return;
    started = true;
    void store.purge();
    requestPersistence();
  }, [store]);

  useEffect(() => {
    const flush = () => void saver.flush();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
      flush();
    };
  }, [saver]);

  const now = Date.now();
  const allNotes = notes ?? [];
  const allFolders = folders ?? [];
  const live = useMemo(() => (notes ?? []).filter((n) => !n.deletedAt), [notes]);
  const deleted = useMemo(
    () => (notes ?? []).filter((n) => n.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [notes],
  );
  const tree = useMemo(() => folderTree(folders ?? []), [folders]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of live) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [live]);
  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    for (const n of live) byFolder.set(n.folderId, (byFolder.get(n.folderId) ?? 0) + 1);
    return { all: live.length, deleted: deleted.length, folders: byFolder };
  }, [live, deleted]);

  const inTrash = view.folder === DELETED_VIEW;
  const folderView = !inTrash && view.folder ? allFolders.find((f) => f.id === view.folder) : undefined;
  const q = view.q?.trim() ?? '';
  const groups: DateGroup<Note>[] = useMemo(() => {
    const pool = inTrash
      ? deleted
      : live.filter(
          (n) => (!view.folder || n.folderId === view.folder) && (!view.tag || n.tags.includes(view.tag)),
        );
    if (q) {
      const found = searchNotes(pool, q, folders ?? [], { deleted: inTrash });
      return found.length > 0 ? [{ label: 'Results', notes: found }] : [];
    }
    if (inTrash) return pool.length > 0 ? [{ label: '', notes: pool }] : [];
    return groupByDate(pool, Date.now());
  }, [inTrash, deleted, live, view.folder, view.tag, q, folders]);

  const note = id ? allNotes.find((n) => n.id === id) : undefined;
  const noteId = note?.id;
  const noteBody = note?.body;
  // Drops the local draft once the store caught up, so edits from another tab or an import show.
  useEffect(() => {
    if (noteId && !saver.pending(noteId)) setDraft((d) => (d?.id === noteId ? undefined : d));
  }, [noteId, noteBody, saver]);
  const value = note && draft?.id === note.id ? draft.body : (note?.body ?? '');
  const memoryNames = useMemoryNames(note?.project);

  const titles = useRef<readonly LinkTarget[]>([]);
  titles.current = [
    ...[...new Set(live.map((n) => n.title))].map((label): LinkTarget => ({ label, kind: 'note' })),
    ...memoryNames.map((label): LinkTarget => ({ label, kind: 'memory' })),
  ];
  const tagList = useRef<readonly string[]>([]);
  tagList.current = tags.map(([t]) => t);

  const keepSearch = { search: (prev: object) => prev };
  const openNote = (noteId: string) => navigate({ to: '/notes/$id', params: { id: noteId }, ...keepSearch });

  const createNote = async (body = '', folderId: string = NO_FOLDER, project?: string) => {
    await saver.flush();
    const created = await store.create({ body, folderId, project });
    setFocusId(created.id);
    setReading(false);
    await navigate({
      to: '/notes/$id',
      params: { id: created.id },
      search: folderId === NO_FOLDER ? {} : { folder: folderId },
    });
  };

  const newNote = () => void createNote('', folderView?.id ?? NO_FOLDER);

  const openDaily = () => {
    const title = dailyTitle(new Date());
    const existing = live.find((n) => n.title === title);
    if (existing) void navigate({ to: '/notes/$id', params: { id: existing.id }, search: {} });
    else void createNote(`# ${title}\n\n`);
  };

  const openLink = (target: string, from: Note | undefined) => {
    const r = resolveLink(target, { notes: allNotes, project: from?.project, memoryNames });
    if (r.kind === 'note') void openNote(r.noteId);
    else if (r.kind === 'memory')
      void navigate({ to: '/p/$project/memory/$note', params: { project: r.project, note: r.name } });
    else void createNote(`# ${target}\n\n`, from?.folderId ?? NO_FOLDER, from?.project);
  };

  const onChange = (body: string) => {
    if (!note) return;
    setDraft({ id: note.id, body });
    saver.schedule(note.id, body);
  };

  const removeNote = async () => {
    if (!note) return;
    await saver.flush();
    await store.remove(note.id);
    await navigate({ to: '/notes', ...keepSearch });
  };

  const restoreNote = async () => {
    if (!note) return;
    await store.restore(note.id);
    await navigate({ to: '/notes/$id', params: { id: note.id }, search: {} });
  };

  const destroyNote = async () => {
    if (!note || !window.confirm(`Delete “${note.title}” for good? This can't be undone.`)) return;
    await store.destroy(note.id);
    await navigate({ to: '/notes', ...keepSearch });
  };

  const emptyTrash = async () => {
    if (!window.confirm(`Delete ${deleted.length} notes for good? This can't be undone.`)) return;
    await store.emptyTrash();
    await navigate({ to: '/notes', ...keepSearch });
  };

  const onExport = async () => {
    try {
      await saver.flush();
      downloadBytes(await exportNotes(store.db), `hub-notes-${dailyTitle(new Date())}.zip`);
      setStatus(`Exported ${live.length} notes.`);
    } catch (e) {
      setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    try {
      await saver.flush();
      const entries = [];
      for (const file of files)
        entries.push(...backupEntries(file.name, new Uint8Array(await file.arrayBuffer())));
      const r = await importBackup(store.db, entries);
      retryMissing();
      setStatus(
        `Imported ${r.added} new and ${r.updated} updated notes; ${r.skipped} were already up to date.`,
      );
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const newFolder = async (parentId?: string) => {
    const folder = await store.createFolder('New folder', parentId);
    setEditingFolder(folder.id);
  };

  const deleteFolder = async (folderId: string, name: string) => {
    if (!window.confirm(`Delete the folder “${name}”? Its notes move to Recently Deleted.`)) return;
    await store.deleteFolder(folderId);
    if (view.folder === folderId) await navigate({ to: '/notes', search: {} });
  };

  const setQuery = (text: string) =>
    navigate({ to: '.', search: (prev: object) => ({ ...prev, q: text || undefined }), replace: true });

  const headings = useMemo(() => outline(value), [value]);
  const onHeading = (index: number) => {
    const h = headings[index];
    const root = bodyRef.current;
    if (!h || !root) return;
    // Reading mode renders headings; the editor renders lines.
    const el = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6, .cm-line')].find(
      (node) => node.textContent?.replace(/^#+\s*/, '').trim() === h.text,
    );
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const linked = useMemo(() => (note ? linkedMentions(note, allNotes) : []), [note, allNotes]);
  const unlinked = useMemo(() => (note ? unlinkedMentions(note, allNotes) : []), [note, allNotes]);

  // Read through a ref so the listener, added once, always calls the latest handlers.
  const shortcuts = useRef<Record<string, () => void>>({});
  shortcuts.current = {
    new: newNote,
    switcher: () => setSwitcher(true),
    mode: () => setReading((r) => !r),
    search: () => searchRef.current?.focus(),
    daily: openDaily,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // `code`, not `key`: Alt and Shift change the key's character on some layouts.
      const action =
        e.altKey && !e.shiftKey && e.code === 'KeyN'
          ? 'new'
          : !e.altKey && !e.shiftKey && e.code === 'KeyO'
            ? 'switcher'
            : !e.altKey && !e.shiftKey && e.code === 'KeyE'
              ? 'mode'
              : !e.altKey && e.shiftKey && e.code === 'KeyF'
                ? 'search'
                : !e.altKey && e.shiftKey && e.code === 'KeyD'
                  ? 'daily'
                  : undefined;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      shortcuts.current[action]?.();
    };
    // Capture phase, so the editor never swallows these first.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // A narrow screen shows one column; picking a folder returns to the list.
  useEffect(() => setShowFolders(false), [view.folder, view.tag]);

  const listTitle = inTrash
    ? 'Recently Deleted'
    : view.tag
      ? `#${view.tag}`
      : (folderView?.name ?? 'All Notes');
  const isDeleted = Boolean(note?.deletedAt);
  const showReading = reading || isDeleted;

  const editorProps: EditorProps | undefined = note && {
    value,
    onChange,
    readOnly: isDeleted,
    dark,
    autoFocus: focusId === note.id,
    onBlur: () => void saver.flush(),
    linkTargets: () => titles.current,
    tags: () => tagList.current,
    onOpenLink: (link) => openLink(link.target, note),
    onPasteImage: (file) => store.addAttachment(note.id, file, file.name || 'image.png'),
    resolveAttachment: resolve,
  };

  const renderWikiLink = (inner: string) => {
    const { target, alias, heading } = parseLinkText(inner);
    const r = resolveLink(target, { notes: allNotes, project: note?.project, memoryNames });
    const label = alias ?? (heading ? `${target} › ${heading}` : target);
    if (r.kind === 'memory') {
      return (
        <Link
          to="/p/$project/memory/$note"
          params={{ project: r.project, note: r.name }}
          data-wikilink={target}
        >
          {label}
        </Link>
      );
    }
    return (
      <button
        type="button"
        data-wikilink={target}
        onClick={() => openLink(target, note)}
        title={r.kind === 'unresolved' ? 'No note with this title yet; click to create it' : undefined}
        className={cn(
          'cursor-pointer underline underline-offset-2',
          r.kind === 'unresolved' && 'text-muted-foreground decoration-dashed',
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <HostNotice />
      <div className="flex h-[calc(100dvh-5rem)] min-h-96 overflow-hidden rounded-md border">
        <aside
          className={cn(
            'w-full shrink-0 overflow-auto border-r md:w-72 lg:block lg:w-52',
            showFolders ? 'block' : 'hidden',
            id && 'max-md:hidden',
          )}
        >
          <NotesSidebar
            view={view}
            folders={tree}
            tags={tags}
            counts={counts}
            editingFolder={editingFolder}
            onEditFolder={setEditingFolder}
            onDaily={openDaily}
            onNewFolder={(parentId) => void newFolder(parentId)}
            onRenameFolder={(fid, name) => void store.renameFolder(fid, name)}
            onDeleteFolder={(fid, name) => void deleteFolder(fid, name)}
          />
        </aside>

        <section
          aria-label="Notes"
          className={cn(
            'w-full shrink-0 flex-col border-r md:w-72 lg:flex',
            showFolders ? 'hidden' : 'flex',
            id && 'max-md:hidden',
          )}
        >
          <div className="space-y-2 border-b p-2">
            <div className="flex items-center gap-1">
              <span className="lg:hidden">
                {iconButton('Folders and tags', () => setShowFolders(true), <FolderTree aria-hidden />)}
              </span>
              <h2 className="min-w-0 flex-1 truncate px-1 font-semibold">{listTitle}</h2>
              {inTrash
                ? deleted.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => void emptyTrash()}>
                      Empty
                    </Button>
                  )
                : iconButton('New note (Ctrl+Alt+N)', newNote, <Plus aria-hidden />)}
            </div>
            <label className="flex items-center gap-2 rounded-md border px-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={searchRef}
                value={view.q ?? ''}
                onChange={(e) => void setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') void setQuery('');
                }}
                placeholder="Search (tag:x, folder:x)"
                maxLength={200}
                aria-label="Search notes"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
            {inTrash && (
              <p className="px-1 text-xs text-muted-foreground">
                Notes are deleted for good {KEEP_DELETED_DAYS} days after they were moved here.
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {notes === undefined ? (
              <p className="p-4 text-sm text-muted-foreground">Loading...</p>
            ) : (
              <NoteList
                groups={groups}
                selectedId={id}
                now={now}
                asideOf={
                  inTrash
                    ? (n) => `${daysLeft(n.deletedAt ?? now, now, KEEP_DELETED_DAYS)} days left`
                    : undefined
                }
                empty={
                  q
                    ? 'No matching notes.'
                    : inTrash
                      ? 'Nothing here.'
                      : 'No notes. Press Ctrl+Alt+N to make one.'
                }
              />
            )}
          </div>
        </section>

        <div className={cn('min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden md:flex')}>
          <div className="flex flex-wrap items-center gap-1 border-b p-1.5">
            {id && (
              <Link to="/notes" search={(prev: object) => prev} className="md:hidden">
                <span className="sr-only">Back to the list</span>
                <ArrowLeft className="m-1.5 size-4" aria-hidden />
              </Link>
            )}
            {note && !isDeleted && (
              <>
                {iconButton(
                  note.pinned ? 'Unpin' : 'Pin',
                  () => void store.setPinned(note.id, !note.pinned),
                  note.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />,
                  note.pinned,
                )}
                <select
                  value={note.folderId}
                  onChange={(e) => void store.move(note.id, e.target.value)}
                  aria-label="Folder"
                  className={selectClass}
                >
                  <option value={NO_FOLDER}>No folder</option>
                  {tree.map(({ folder, path }) => (
                    <option key={folder.id} value={folder.id}>
                      {path}
                    </option>
                  ))}
                </select>
                <select
                  value={note.project ?? ''}
                  onChange={(e) => void store.setProject(note.id, e.target.value || undefined)}
                  aria-label="Project"
                  title="Project: [[links]] fall back to its memory notes"
                  className={selectClass}
                >
                  <option value="">No project</option>
                  {note.project && !projects.some((p) => p.id === note.project) && (
                    <option value={note.project}>{note.project}</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {iconButton(
                  reading ? 'Edit (Ctrl+E)' : 'Read (Ctrl+E)',
                  () => setReading((r) => !r),
                  reading ? <Pencil aria-hidden /> : <BookOpen aria-hidden />,
                )}
                {iconButton('Delete', () => void removeNote(), <Trash2 aria-hidden />)}
              </>
            )}
            {note && isDeleted && (
              <>
                <Button variant="ghost" size="sm" onClick={() => void restoreNote()}>
                  <RotateCcw aria-hidden /> Restore
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void destroyNote()}>
                  <Trash2 aria-hidden /> Delete now
                </Button>
              </>
            )}
            <span className="ml-auto flex items-center gap-1">
              {status && (
                <span
                  role="status"
                  className="max-w-72 truncate px-1 text-xs text-muted-foreground"
                  title={status}
                >
                  {status}
                </span>
              )}
              {iconButton('Export all notes as a zip', () => void onExport(), <Download aria-hidden />)}
              {iconButton(
                'Import a zip or .md files',
                () => importRef.current?.click(),
                <Upload aria-hidden />,
              )}
              <input
                ref={importRef}
                type="file"
                accept=".zip,.md,application/zip,text/markdown"
                multiple
                hidden
                onChange={(e) => void onImport(e)}
              />
            </span>
          </div>

          {note && editorProps ? (
            <div className="flex min-h-0 flex-1">
              <div ref={bodyRef} className="min-w-0 flex-1 overflow-auto">
                <p className="px-4 pt-2 text-center text-xs text-muted-foreground">
                  {isDeleted
                    ? `In Recently Deleted · ${daysLeft(note.deletedAt ?? now, now, KEEP_DELETED_DAYS)} days left`
                    : `Edited ${new Date(note.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
                </p>
                {showReading ? (
                  <div className="px-6 py-4">
                    <Markdown
                      text={value}
                      project={note.project}
                      resolveAttachment={resolve}
                      renderWikiLink={renderWikiLink}
                      onToggleTask={isDeleted ? undefined : (offset) => onChange(toggleTask(value, offset))}
                    />
                  </div>
                ) : (
                  <div className="h-[calc(100%-1.75rem)]">
                    <NoteEditor key={note.id} {...editorProps} />
                  </div>
                )}
              </div>
              <aside
                aria-label="Outline and backlinks"
                className="hidden w-60 shrink-0 overflow-auto border-l xl:block"
              >
                <NotePanel
                  headings={headings}
                  linked={linked}
                  unlinked={unlinked}
                  onHeading={onHeading}
                  onLinkMention={(other) => void store.save(other.id, linkMention(other.body, note.title))}
                />
              </aside>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {id && notes !== undefined ? (
                'This note no longer exists.'
              ) : (
                <div className="space-y-1">
                  <p>Pick a note, or press Ctrl+Alt+N for a new one.</p>
                  <p>Ctrl+O opens or creates a note by title; Ctrl+Shift+D opens today's daily note.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {switcher && notes && (
        <QuickSwitcher
          notes={allNotes}
          folders={allFolders}
          onOpen={(nid) => void openNote(nid)}
          onCreate={(title) => void createNote(`# ${title}\n\n`)}
          onClose={() => setSwitcher(false)}
        />
      )}
    </>
  );
}
