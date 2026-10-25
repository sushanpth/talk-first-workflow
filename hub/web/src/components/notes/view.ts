/** The Notes page's URL state. No folder and no tag is All Notes. */
export interface NotesSearch {
  /** A folder id, or `DELETED_VIEW`. */
  folder?: string;
  tag?: string;
  q?: string;
}

/** Folder ids are UUIDs, so this can't collide with one. */
export const DELETED_VIEW = 'deleted';

export function parseNotesSearch(raw: Record<string, unknown>): NotesSearch {
  // The router parses `q=123` as a number.
  const text = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const search: NotesSearch = {};
  const folder = text(raw.folder).trim();
  const tag = text(raw.tag).trim().replace(/^#/, '').toLowerCase();
  // Not trimmed: the search box shows it, and a trailing space is mid-typing.
  const q = text(raw.q);
  if (folder) search.folder = folder;
  if (tag) search.tag = tag;
  if (q.trim()) search.q = q;
  return search;
}
