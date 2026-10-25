import { NotesDb } from './db.ts';
import { noteTitle, parseTags } from './model.ts';
import { type Folder, NO_FOLDER, type Note } from './types.ts';

export const KEEP_DELETED_DAYS = 30;
export const SAVE_DELAY_MS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `crypto.randomUUID` needs a secure context; a LAN address over http isn't one. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Fields derived from the body, refreshed on every save. */
const derived = (body: string) => ({ body, title: noteTitle(body), tags: parseTags(body) });

export class NotesStore {
  constructor(
    readonly db: NotesDb,
    private readonly now: () => number = Date.now,
  ) {}

  async create(init: { body?: string; folderId?: string; project?: string } = {}): Promise<Note> {
    const time = this.now();
    const note: Note = {
      id: newId(),
      ...derived(init.body ?? ''),
      folderId: init.folderId ?? NO_FOLDER,
      ...(init.project && { project: init.project }),
      pinned: false,
      createdAt: time,
      updatedAt: time,
    };
    await this.db.notes.add(note);
    return note;
  }

  async save(id: string, body: string): Promise<void> {
    await this.db.transaction('rw', this.db.notes, async () => {
      const note = await this.db.notes.get(id);
      if (!note || note.body === body) return;
      await this.db.notes.update(id, { ...derived(body), updatedAt: this.now() });
    });
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    await this.db.notes.update(id, { pinned });
  }

  async move(id: string, folderId: string): Promise<void> {
    await this.db.notes.update(id, { folderId });
  }

  async setProject(id: string, project: string | undefined): Promise<void> {
    // Dexie drops a key set to undefined.
    await this.db.notes.update(id, { project: project || undefined });
  }

  /** Moves the note to Recently Deleted. */
  async remove(id: string): Promise<void> {
    await this.db.notes.update(id, { deletedAt: this.now() });
  }

  async restore(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.notes, this.db.folders, async () => {
      const note = await this.db.notes.get(id);
      if (!note) return;
      const folderGone = note.folderId !== NO_FOLDER && !(await this.db.folders.get(note.folderId));
      await this.db.notes.update(id, { deletedAt: undefined, ...(folderGone && { folderId: NO_FOLDER }) });
    });
  }

  /** Deletes notes for good, with their attachments. */
  async destroy(...ids: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.notes, this.db.attachments, async () => {
      await this.db.notes.bulkDelete(ids);
      await this.db.attachments.where('noteId').anyOf(ids).delete();
    });
  }

  async emptyTrash(): Promise<void> {
    await this.destroy(...(await this.db.notes.where('deletedAt').above(0).primaryKeys()));
  }

  /** Deletes notes that have been in Recently Deleted too long; returns how many. */
  async purge(): Promise<number> {
    const cutoff = this.now() - KEEP_DELETED_DAYS * DAY_MS;
    const ids = await this.db.notes.where('deletedAt').between(0, cutoff, false, false).primaryKeys();
    if (ids.length > 0) await this.destroy(...ids);
    return ids.length;
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    const folder: Folder = { id: newId(), name: name.trim() || 'New folder', ...(parentId && { parentId }) };
    await this.db.folders.add(folder);
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    if (name.trim()) await this.db.folders.update(id, { name: name.trim() });
  }

  /** Deletes the folder and its subfolders; their notes go to Recently Deleted. */
  async deleteFolder(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.folders, this.db.notes, async () => {
      const all = await this.db.folders.toArray();
      const doomed = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const f of all) {
          if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
            doomed.add(f.id);
            grew = true;
          }
        }
      }
      const time = this.now();
      await this.db.notes
        .where('folderId')
        .anyOf([...doomed])
        .filter((n) => !n.deletedAt)
        .modify({ deletedAt: time });
      await this.db.folders.bulkDelete([...doomed]);
    });
  }

  async addAttachment(noteId: string, blob: Blob, name: string): Promise<string> {
    const id = newId();
    await this.db.attachments.add({
      id,
      noteId,
      mime: blob.type || 'application/octet-stream',
      name,
      blob,
      createdAt: this.now(),
    });
    return id;
  }

  async attachmentBlob(id: string): Promise<Blob | undefined> {
    return (await this.db.attachments.get(id))?.blob;
  }
}

/** Holds each note's latest body and saves it after a pause in typing, or at once on flush. */
export class DebouncedSaver {
  private readonly bodies = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly save: (id: string, body: string) => Promise<void>,
    private readonly delayMs = SAVE_DELAY_MS,
  ) {}

  schedule(id: string, body: string): void {
    this.bodies.set(id, body);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  pending(id: string): boolean {
    return this.bodies.has(id);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    const entries = [...this.bodies];
    this.bodies.clear();
    for (const [id, body] of entries) await this.save(id, body);
  }
}

/** Blob URLs for attachment ids, loaded on first ask; `dispose` revokes them all. */
export class AttachmentUrls {
  private readonly urls = new Map<string, string | null>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(private readonly load: (id: string) => Promise<Blob | undefined>) {}

  get(id: string): string | undefined {
    if (!this.urls.has(id)) {
      this.urls.set(id, null);
      void this.load(id).then((blob) => {
        if (this.disposed || !blob) return;
        this.urls.set(id, URL.createObjectURL(blob));
        for (const notify of this.listeners) notify();
      });
    }
    return this.urls.get(id) ?? undefined;
  }

  /** Forgets a missing id so the next `get` tries again, e.g. after an import. */
  retryMissing(): void {
    for (const [id, url] of this.urls) if (url === null) this.urls.delete(id);
  }

  subscribe(notify: () => void): () => void {
    this.listeners.add(notify);
    return () => {
      this.listeners.delete(notify);
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const url of this.urls.values()) if (url) URL.revokeObjectURL(url);
    this.urls.clear();
    this.listeners.clear();
  }
}

let persistAsked = false;

/** Asks once for storage the browser won't evict under pressure. */
export function requestPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}

let shared: NotesStore | undefined;

/** The app's store; opened lazily so importing this module never touches IndexedDB. */
export function notesStore(): NotesStore {
  shared ??= new NotesStore(new NotesDb());
  return shared;
}
