import { describe, expect, it } from 'vitest';
import { parseNotesSearch } from '@/components/notes/view';
import { router } from '@/router';
import { NotesPage } from '@/routes/notes';

const matched = (path: string) => router.matchRoutes(path, {});

describe('notes routes', () => {
  it('renders the notes page for the list and for one note', () => {
    for (const path of ['/notes', '/notes/', '/notes/0b0c']) {
      const ids = matched(path).map((m) => m.routeId);
      expect(ids, path).toContain('/notes');
      expect(router.routesById['/notes'].options.component).toBe(NotesPage);
    }
    expect(matched('/notes/0b0c').at(-1)?.params).toMatchObject({ id: '0b0c' });
  });
});

describe('parseNotesSearch', () => {
  it('keeps folder, tag and query, dropping blanks', () => {
    expect(parseNotesSearch({ folder: 'f1', tag: '#Home', q: 'milk ' })).toEqual({
      folder: 'f1',
      tag: 'home',
      q: 'milk ',
    });
    expect(parseNotesSearch({ folder: '', tag: ' ', q: '  ', other: 'x' })).toEqual({});
    expect(parseNotesSearch({ q: 123 })).toEqual({ q: '123' });
  });
});
