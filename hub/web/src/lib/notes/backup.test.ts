import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BackupEntry, backupEntries, exportNotes, importBackup, MAX_FILE_BYTES } from './backup.ts';
import { NotesDb } from './db.ts';
import { NotesStore } from './store.ts';
import { NO_FOLDER } from './types.ts';

const dbs: NotesDb[] = [];
const freshStore = (clock: () => number = () => Date.UTC(2026, 9, 25)) => {
  const db = new NotesDb(`test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  dbs.push(db);
  return new NotesStore(db, clock);
};

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

/** Notes as a reader sees them: folder by path, not by id. */
async function snapshot(store: NotesStore) {
  const folders = await store.db.folders.toArray();
  const pathOf = (id: string): string => {
    const f = folders.find((x) => x.id === id);
    return f ? `${f.parentId ? `${pathOf(f.parentId)}/` : ''}${f.name}` : '';
  };
  const notes = (await store.db.notes.toArray())
    .filter((n) => !n.deletedAt)
    .map(({ folderId, ...n }) => ({ ...n, folder: pathOf(folderId) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const attachments = await Promise.all(
    // The zip has nowhere to keep an attachment's createdAt, and nothing shows it.
    (await store.db.attachments.toArray()).map(async ({ blob, createdAt: _, ...a }) => ({
      ...a,
      text: await blob.text(),
    })),
  );
  return { notes, attachments: attachments.sort((a, b) => a.id.localeCompare(b.id)) };
}

describe('backup', () => {
  let source: NotesStore;
  let imageId: string;
  let groceriesId: string;

  beforeEach(async () => {
    source = freshStore();
    const work = await source.createFolder('Work');
    const sub = await source.createFolder('Sub', work.id);
    const groceries = await source.create({ folderId: sub.id, project: 'example-project' });
    groceriesId = groceries.id;
    imageId = await source.addAttachment(
      groceries.id,
      new Blob(['png bytes'], { type: 'image/png' }),
      'my photo.png',
    );
    await source.save(groceries.id, `# Groceries\n- [ ] milk #home\n\n![my photo](attachment:${imageId})\n`);
    await source.setPinned(groceries.id, true);
    await source.create({ body: '# Plain\nsee [[Groceries]]' });
    await source.create({ body: '# Plain\nsame title, other note' });
    await source.create({ body: '# What? Why: now' });
    const gone = await source.create({ body: '# Deleted' });
    await source.remove(gone.id);
  });

  it('round trips notes, folders and attachments', async () => {
    const zip = await exportNotes(source.db);
    const target = freshStore();
    const result = await importBackup(target.db, backupEntries('notes.zip', zip));
    expect(result).toEqual({ added: 4, updated: 0, skipped: 0, attachments: 1, ignored: [] });
    expect(await snapshot(target)).toEqual(await snapshot(source));
  });

  it('writes Obsidian-readable markdown with relative image paths', async () => {
    const files = unzipSync(await exportNotes(source.db));
    const paths = Object.keys(files).sort();
    expect(paths).toEqual([
      'Plain (2).md',
      'Plain.md',
      'What- Why- now.md',
      'Work/Sub/Groceries.md',
      `attachments/${imageId}-my photo.png`,
    ]);
    const md = strFromU8(files['Work/Sub/Groceries.md'] ?? new Uint8Array());
    expect(md).toContain(`id: ${groceriesId}\npinned: true\ntags: ["home"]\nproject: "example-project"\n`);
    expect(md).toContain(`![my photo](../../attachments/${imageId}-my%20photo.png)`);
  });

  it('keeps the newer copy of a note', async () => {
    const zip = await exportNotes(source.db);
    const newer = (Date.UTC(2026, 9, 25) as number) + 1000;
    const target = new NotesStore(source.db, () => newer);
    await target.save(groceriesId, '# Groceries\nedited after the backup');
    const result = await importBackup(source.db, backupEntries('notes.zip', zip));
    expect(result).toMatchObject({ added: 0, updated: 0, skipped: 4 });
    expect((await source.db.notes.get(groceriesId))?.body).toBe('# Groceries\nedited after the backup');
  });

  it('brings back notes that were deleted after the backup', async () => {
    const zip = await exportNotes(source.db);
    await source.remove(groceriesId);
    await importBackup(source.db, backupEntries('notes.zip', zip));
    expect((await source.db.notes.get(groceriesId))?.deletedAt).toBeUndefined();
  });

  it('imports a loose markdown file without front matter as a new note', async () => {
    const target = freshStore();
    const result = await importBackup(target.db, backupEntries('Idea.md', strToU8('# Idea\nwith #tag')));
    expect(result.added).toBe(1);
    const [note] = await target.db.notes.toArray();
    expect(note).toMatchObject({
      title: 'Idea',
      tags: ['tag'],
      folderId: NO_FOLDER,
      body: '# Idea\nwith #tag',
    });
  });

  it('skips a live note whose backup copy has the same updatedAt', async () => {
    const zip = await exportNotes(source.db);
    const result = await importBackup(source.db, backupEntries('notes.zip', zip));
    expect(result).toMatchObject({ added: 0, updated: 0, skipped: 4, attachments: 0 });
  });

  it('does not duplicate attachments on a second import', async () => {
    const zip = await exportNotes(source.db);
    const target = freshStore();
    await importBackup(target.db, backupEntries('notes.zip', zip));
    await target.db.notes.clear();
    const again = await importBackup(target.db, backupEntries('notes.zip', zip));
    expect(again).toMatchObject({ added: 4, attachments: 0 });
    expect(await target.db.attachments.count()).toBe(1);
  });
});

const md = (path: string, text: string): BackupEntry => ({ path, data: strToU8(text) });
const files = (...entries: BackupEntry[]) => ({ entries, ignored: [] });

describe('importBackup', () => {
  const ID = '0b0c0d0e-0000-4000-8000-000000000001';
  const day = (d: number) => Date.UTC(2026, 9, d);

  it('replaces an older note with a newer backup copy, keeping its createdAt', async () => {
    const store = freshStore(() => day(1));
    await store.db.notes.add({
      id: ID,
      title: 'Old',
      body: '# Old',
      folderId: NO_FOLDER,
      tags: [],
      pinned: false,
      createdAt: day(1),
      updatedAt: day(2),
    });
    const text = `---\nid: ${ID}\nupdated: ${new Date(day(3)).toISOString()}\n---\n# New\nwith #fresh`;
    const result = await importBackup(store.db, files(md('New.md', text)));
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    expect(await store.db.notes.get(ID)).toMatchObject({
      title: 'New',
      body: '# New\nwith #fresh',
      tags: ['fresh'],
      createdAt: day(1),
      updatedAt: day(3),
    });
  });

  it('reads Obsidian front matter: block lists, quoted values and CRLF', async () => {
    const store = freshStore();
    const text = [
      '---',
      `id: "${ID}"`,
      'tags:',
      '  - home',
      '  - "kitchen"',
      "project: 'example-project'",
      'pinned: true',
      'aliases: [a, "b"]',
      '---',
      '# Recipe',
      'body #own',
    ].join('\r\n');
    await importBackup(store.db, files(md('Recipe.md', text)));
    const note = await store.db.notes.get(ID);
    expect(note).toMatchObject({ title: 'Recipe', project: 'example-project', pinned: true, tags: ['own'] });
    expect(note?.body).toBe('# Recipe\r\nbody #own');
  });

  it('leaves links that climb out of the backup alone', async () => {
    const store = freshStore();
    const image = { path: 'secret.png', data: new Uint8Array([1]) };
    await importBackup(
      store.db,
      files(md('dir/Note.md', '![a](../../secret.png) ![b](../secret.png)'), image),
    );
    const [note] = await store.db.notes.toArray();
    expect(note?.body).toMatch(/^!\[a\]\(\.\.\/\.\.\/secret\.png\) !\[b\]\(attachment:[0-9a-f-]{36}\)$/);
    expect(await store.db.attachments.count()).toBe(1);
  });

  it('skips macOS and Obsidian housekeeping files', async () => {
    const store = freshStore();
    const zip = zipSync({
      'Note.md': strToU8('# Note'),
      '__MACOSX/._Note.md': strToU8('junk'),
      '.obsidian/workspace.md': strToU8('# Workspace'),
      'dir/.DS_Store': strToU8('junk'),
    });
    const result = await importBackup(store.db, backupEntries('vault.zip', zip));
    expect(result).toMatchObject({ added: 1, ignored: [] });
    expect((await store.db.notes.toArray()).map((n) => n.title)).toEqual(['Note']);
  });
});

describe('backupEntries', () => {
  it('keeps notes and images, and lists other or oversized files as ignored', () => {
    const zip = zipSync({
      'a.md': strToU8('# A'),
      'img/b.png': new Uint8Array([1]),
      'c.svg': strToU8('<svg/>'),
      'd.pdf': new Uint8Array([1]),
      'big.png': [new Uint8Array(MAX_FILE_BYTES + 1), { level: 1 }],
      'folder/': new Uint8Array(),
    });
    const { entries, ignored } = backupEntries('notes.zip', zip);
    expect(entries.map((e) => e.path).sort()).toEqual(['a.md', 'img/b.png']);
    expect(ignored.sort()).toEqual(['big.png', 'c.svg', 'd.pdf']);
  });

  it('ignores a loose file that is not markdown', () => {
    expect(backupEntries('x.txt', strToU8('x'))).toEqual({ entries: [], ignored: ['x.txt'] });
  });
});
