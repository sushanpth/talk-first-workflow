import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesDb } from './db.ts';
import { AttachmentUrls, DebouncedSaver, KEEP_DELETED_DAYS, NotesStore } from './store.ts';
import { NO_FOLDER } from './types.ts';

const DAY = 24 * 60 * 60 * 1000;
let db: NotesDb;
let clock: number;
let store: NotesStore;

beforeEach(() => {
  db = new NotesDb(`test-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  clock = Date.UTC(2026, 9, 25);
  store = new NotesStore(db, () => clock);
});

afterEach(async () => {
  await db.delete();
});

const liveIds = async () => (await db.notes.toArray()).filter((n) => !n.deletedAt).map((n) => n.id);
const deletedIds = async () => (await db.notes.where('deletedAt').above(0).toArray()).map((n) => n.id);

describe('notes', () => {
  it('derives the title and tags from the body on every save', async () => {
    const note = await store.create();
    expect(note).toMatchObject({ title: 'New note', folderId: NO_FOLDER, tags: [], pinned: false });
    clock += 1000;
    await store.save(note.id, '# Groceries\nmilk #home');
    expect(await db.notes.get(note.id)).toMatchObject({
      title: 'Groceries',
      tags: ['home'],
      createdAt: note.createdAt,
      updatedAt: clock,
    });
  });

  it('moves a deleted note to Recently Deleted and restores it', async () => {
    const note = await store.create({ body: 'a' });
    await store.remove(note.id);
    expect(await liveIds()).toEqual([]);
    expect(await deletedIds()).toEqual([note.id]);
    await store.restore(note.id);
    expect(await liveIds()).toEqual([note.id]);
    expect(await deletedIds()).toEqual([]);
  });

  it('purges notes deleted more than 30 days ago, with their attachments', async () => {
    const old = await store.create({ body: 'old' });
    const recent = await store.create({ body: 'recent' });
    const live = await store.create({ body: 'live' });
    await store.addAttachment(old.id, new Blob(['x'], { type: 'image/png' }), 'a.png');
    const kept = await store.addAttachment(live.id, new Blob(['y'], { type: 'image/png' }), 'b.png');
    await store.remove(old.id);
    clock += 10 * DAY;
    await store.remove(recent.id);
    clock += (KEEP_DELETED_DAYS - 10) * DAY + 1;
    expect(await store.purge()).toBe(1);
    expect((await db.notes.toArray()).map((n) => n.id).sort()).toEqual([recent.id, live.id].sort());
    expect((await db.attachments.toArray()).map((a) => a.id)).toEqual([kept]);
  });

  it('keeps a note exactly 30 days and purges it 1 ms later', async () => {
    expect(await store.purge()).toBe(0);
    const note = await store.create({ body: 'a' });
    await store.remove(note.id);
    clock += KEEP_DELETED_DAYS * DAY;
    expect(await store.purge()).toBe(0);
    expect(await deletedIds()).toEqual([note.id]);
    clock += 1;
    expect(await store.purge()).toBe(1);
    expect(await db.notes.count()).toBe(0);
  });

  it('restores a note into its folder when the folder still exists', async () => {
    const work = await store.createFolder('Work');
    const note = await store.create({ folderId: work.id });
    await store.remove(note.id);
    await store.restore(note.id);
    expect(await db.notes.get(note.id)).toMatchObject({ folderId: work.id });
    expect(await liveIds()).toEqual([note.id]);
  });

  it('refuses SVG attachments', async () => {
    const note = await store.create();
    const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    await expect(store.addAttachment(note.id, svg, 'a.svg')).rejects.toThrow(/SVG/);
    await expect(store.addAttachment(note.id, new Blob(['x']), 'b.SVG')).rejects.toThrow(/SVG/);
    expect(await db.attachments.count()).toBe(0);
  });

  it('deletes a note for good, with its attachments', async () => {
    const note = await store.create({ body: 'a' });
    await store.addAttachment(note.id, new Blob(['x']), 'a.png');
    await store.destroy(note.id);
    expect(await db.notes.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
  });

  it('pins, moves and tags a note with a project', async () => {
    const folder = await store.createFolder('Work');
    const note = await store.create();
    await store.setPinned(note.id, true);
    await store.move(note.id, folder.id);
    await store.setProject(note.id, 'example-project');
    expect(await db.notes.get(note.id)).toMatchObject({
      pinned: true,
      folderId: folder.id,
      project: 'example-project',
    });
    await store.setProject(note.id, undefined);
    expect((await db.notes.get(note.id))?.project).toBeUndefined();
  });
});

describe('folders', () => {
  it('renames a folder', async () => {
    const folder = await store.createFolder('Wrok');
    await store.renameFolder(folder.id, ' Work ');
    expect((await db.folders.get(folder.id))?.name).toBe('Work');
  });

  it('deleting a folder sends its notes and subfolders’ notes to Recently Deleted', async () => {
    const work = await store.createFolder('Work');
    const sub = await store.createFolder('Sub', work.id);
    const home = await store.createFolder('Home');
    const a = await store.create({ folderId: work.id });
    const b = await store.create({ folderId: sub.id });
    const c = await store.create({ folderId: home.id });
    await store.deleteFolder(work.id);
    expect((await db.folders.toArray()).map((f) => f.id)).toEqual([home.id]);
    expect((await deletedIds()).sort()).toEqual([a.id, b.id].sort());
    expect(await liveIds()).toEqual([c.id]);
  });

  it('deletes a three-level folder chain, keeping the deletedAt of notes already deleted', async () => {
    const a = await store.createFolder('A');
    const b = await store.createFolder('B', a.id);
    const c = await store.createFolder('C', b.id);
    const early = await store.create({ folderId: b.id });
    await store.remove(early.id);
    const firstDeletedAt = clock;
    clock += 5 * DAY;
    const deep = await store.create({ folderId: c.id });
    await store.deleteFolder(a.id);
    expect(await db.folders.count()).toBe(0);
    expect((await db.notes.get(early.id))?.deletedAt).toBe(firstDeletedAt);
    expect((await db.notes.get(deep.id))?.deletedAt).toBe(clock);
  });

  it('restores a note whose folder is gone outside any folder', async () => {
    const work = await store.createFolder('Work');
    const note = await store.create({ folderId: work.id });
    await store.deleteFolder(work.id);
    await store.restore(note.id);
    expect(await db.notes.get(note.id)).toMatchObject({ folderId: NO_FOLDER });
    expect((await db.notes.get(note.id))?.deletedAt).toBeUndefined();
  });
});

describe('DebouncedSaver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves only the last body after the delay', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const saver = new DebouncedSaver(save, 300);
    saver.schedule('a', 'one');
    saver.schedule('a', 'two');
    expect(saver.pending('a')).toBe(true);
    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save.mock.calls).toEqual([['a', 'two']]);
    expect(saver.pending('a')).toBe(false);
  });

  it('saves at once on flush', async () => {
    const save = vi.fn(async () => {});
    const saver = new DebouncedSaver(save, 300);
    saver.schedule('a', 'one');
    saver.schedule('b', 'two');
    await saver.flush();
    expect(save.mock.calls).toEqual([
      ['a', 'one'],
      ['b', 'two'],
    ]);
  });
});

describe('AttachmentUrls', () => {
  it('gives a blob URL once loaded and revokes it on dispose', async () => {
    const note = await store.create();
    const id = await store.addAttachment(note.id, new Blob(['png'], { type: 'image/png' }), 'a.png');
    const urls = new AttachmentUrls((key) => store.attachmentBlob(key));
    const loaded = new Promise<void>((resolve) => urls.subscribe(resolve));
    expect(urls.get(id)).toBeUndefined();
    await loaded;
    const url = urls.get(id);
    expect(url).toMatch(/^blob:/);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    urls.dispose();
    expect(revoke).toHaveBeenCalledWith(url);
  });
});
