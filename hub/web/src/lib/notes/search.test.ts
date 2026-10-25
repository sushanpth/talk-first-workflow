import { describe, expect, it } from 'vitest';
import { parseQuery, searchNotes } from './search.ts';
import { type Folder, NO_FOLDER, type Note } from './types.ts';

const note = (id: string, title: string, body: string, over: Partial<Note> = {}): Note => ({
  id,
  title,
  body: `# ${title}\n${body}`,
  folderId: NO_FOLDER,
  tags: [],
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const folders: Folder[] = [{ id: 'f1', name: 'Work' }];
const notes = [
  note('a', 'Shopping', 'milk and bread', { updatedAt: 3, tags: ['home'] }),
  note('b', 'Diary', 'went shopping for MILK', { updatedAt: 5 }),
  note('c', 'Milk prices', 'compare', { updatedAt: 1, folderId: 'f1', tags: ['work', 'home'] }),
  note('d', 'Meeting', 'milk on the agenda', { updatedAt: 9, deletedAt: 10 }),
];
const ids = (q: string) => searchNotes(notes, q, folders).map((n) => n.id);

describe('searchNotes', () => {
  it('needs every term, ignoring case', () => {
    expect(ids('milk shopping')).toEqual(['a', 'b']);
    expect(ids('MILK bread')).toEqual(['a']);
  });

  it('ranks title matches first, then newest', () => {
    expect(ids('milk')).toEqual(['c', 'b', 'a']);
  });

  it('filters by tag and folder name', () => {
    expect(ids('tag:home')).toEqual(['a', 'c']);
    expect(ids('#Work')).toEqual(['c']);
    expect(ids('folder:work milk')).toEqual(['c']);
    expect(ids('folder:nope')).toEqual([]);
  });

  it('skips notes in Recently Deleted', () => {
    expect(ids('agenda')).toEqual([]);
  });

  it('matches a quoted phrase as one term', () => {
    expect(ids('"and bread"')).toEqual(['a']);
    expect(ids('"bread and"')).toEqual([]);
  });
});

describe('parseQuery', () => {
  it('separates filters from terms', () => {
    expect(parseQuery('Tag:Home folder:"My Work" milk')).toEqual({
      terms: ['milk'],
      tags: ['home'],
      folders: ['my work'],
    });
  });
});
