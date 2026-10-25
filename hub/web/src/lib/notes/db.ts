import Dexie, { type DexieOptions, type EntityTable } from 'dexie';
import type { Attachment, Folder, Note } from './types.ts';

export const DB_NAME = 'talk-first-hub-notes';

export class NotesDb extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  folders!: EntityTable<Folder, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;

  /** Tests pass a fresh name and fake-indexeddb in `options`. */
  constructor(name = DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      notes: 'id, updatedAt, folderId, deletedAt, *tags, project',
      folders: 'id, parentId',
      attachments: 'id, noteId',
    });
  }
}
