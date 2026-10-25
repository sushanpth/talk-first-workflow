import { useNavigate } from '@tanstack/react-router';
import type { ChangeEvent } from 'react';
import { type BackupFiles, backupEntries, exportNotes, importBackup } from '@/lib/notes/backup';
import { dailyTitle, resolveLink } from '@/lib/notes/model';
import type { DebouncedSaver, NotesStore } from '@/lib/notes/store';
import { NO_FOLDER, type Note } from '@/lib/notes/types';

function downloadBytes(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface NoteActionsContext {
  store: NotesStore;
  saver: DebouncedSaver;
  /** The open note. */
  note: Note | undefined;
  allNotes: readonly Note[];
  live: readonly Note[];
  deleted: readonly Note[];
  memoryNames: readonly string[];
  /** The `folder` search param: a folder id, the trash, or none. */
  viewFolder: string | undefined;
  /** Where a new note goes: the folder the list shows. */
  newNoteFolder: string;
  retryMissing: () => void;
  setDraft: (draft: { id: string; body: string }) => void;
  setFocusId: (id: string) => void;
  setReading: (reading: boolean) => void;
  setStatus: (status: string) => void;
  setEditingFolder: (id: string) => void;
}

/** What the Notes page's buttons, shortcuts and links do. */
export function useNoteActions(ctx: NoteActionsContext) {
  const navigate = useNavigate();
  const { store, saver, note } = ctx;
  const keepSearch = { search: (prev: object) => prev };

  const openNote = (id: string) => navigate({ to: '/notes/$id', params: { id }, ...keepSearch });

  const createNote = async (body = '', folderId: string = NO_FOLDER, project?: string) => {
    await saver.flush();
    const created = await store.create({ body, folderId, project });
    ctx.setFocusId(created.id);
    ctx.setReading(false);
    await navigate({
      to: '/notes/$id',
      params: { id: created.id },
      search: folderId === NO_FOLDER ? {} : { folder: folderId },
    });
  };

  const newNote = () => void createNote('', ctx.newNoteFolder);

  const openDaily = () => {
    const title = dailyTitle(new Date());
    const existing = ctx.live.find((n) => n.title === title);
    if (existing) void navigate({ to: '/notes/$id', params: { id: existing.id }, search: {} });
    else void createNote(`# ${title}\n\n`);
  };

  const openLink = (target: string, from: Note | undefined) => {
    const r = resolveLink(target, {
      notes: ctx.allNotes,
      project: from?.project,
      memoryNames: ctx.memoryNames,
    });
    if (r.kind === 'note') void openNote(r.noteId);
    else if (r.kind === 'memory')
      void navigate({ to: '/p/$project/memory/$note', params: { project: r.project, note: r.name } });
    else void createNote(`# ${target}\n\n`, from?.folderId ?? NO_FOLDER, from?.project);
  };

  const onChange = (body: string) => {
    if (!note) return;
    ctx.setDraft({ id: note.id, body });
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
    if (!window.confirm(`Delete ${ctx.deleted.length} notes for good? This can't be undone.`)) return;
    await store.emptyTrash();
    await navigate({ to: '/notes', ...keepSearch });
  };

  const onExport = async () => {
    try {
      await saver.flush();
      downloadBytes(await exportNotes(store.db), `hub-notes-${dailyTitle(new Date())}.zip`);
      ctx.setStatus(`Exported ${ctx.live.length} notes.`);
    } catch (e) {
      ctx.setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    try {
      await saver.flush();
      const picked: BackupFiles = { entries: [], ignored: [] };
      for (const file of files) {
        const found = backupEntries(file.name, new Uint8Array(await file.arrayBuffer()));
        picked.entries.push(...found.entries);
        picked.ignored.push(...found.ignored);
      }
      const r = await importBackup(store.db, picked);
      ctx.retryMissing();
      const ignored = r.ignored.length
        ? ` Skipped ${r.ignored.length} files that are not notes or images, or are too large.`
        : '';
      ctx.setStatus(
        `Imported ${r.added} new and ${r.updated} updated notes; ${r.skipped} were already up to date.${ignored}`,
      );
    } catch (err) {
      ctx.setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const newFolder = async (parentId?: string) => {
    const folder = await store.createFolder('New folder', parentId);
    ctx.setEditingFolder(folder.id);
  };

  const deleteFolder = async (folderId: string, name: string) => {
    if (!window.confirm(`Delete the folder “${name}”? Its notes move to Recently Deleted.`)) return;
    await store.deleteFolder(folderId);
    if (ctx.viewFolder === folderId) await navigate({ to: '/notes', search: {} });
  };

  const setQuery = (text: string) =>
    navigate({ to: '.', search: (prev: object) => ({ ...prev, q: text || undefined }), replace: true });

  return {
    openNote,
    createNote,
    newNote,
    openDaily,
    openLink,
    onChange,
    removeNote,
    restoreNote,
    destroyNote,
    emptyTrash,
    onExport,
    onImport,
    newFolder,
    deleteFolder,
    setQuery,
  };
}
