import type { Folder, Note } from './types.ts';

export interface NoteQuery {
  /** Lowercase; every one must appear in the title or body. */
  terms: string[];
  tags: string[];
  /** Lowercase folder names. */
  folders: string[];
}

const TOKEN_RE = /(\w+:)?"([^"]*)"?|(\S+)/g;

/** Plain terms plus `tag:x` (or `#x`) and `folder:x` filters; quotes group words. */
export function parseQuery(text: string): NoteQuery {
  const query: NoteQuery = { terms: [], tags: [], folders: [] };
  for (const m of text.matchAll(TOKEN_RE)) {
    let token = (m[3] ?? `${m[1] ?? ''}${m[2] ?? ''}`).toLowerCase();
    let kind: keyof NoteQuery = 'terms';
    const filter = /^(tag|folder):/.exec(token);
    if (filter) {
      kind = filter[1] === 'tag' ? 'tags' : 'folders';
      token = token.slice(filter[0].length);
    } else if (token.length > 1 && token.startsWith('#')) {
      kind = 'tags';
    }
    if (kind === 'tags') token = token.replace(/^#/, '');
    if (token) query[kind].push(token);
  }
  return query;
}

/** Notes matching the query, live ones unless `deleted`; more terms in the title first, then newest. */
export function searchNotes<T extends Note>(
  notes: readonly T[],
  text: string,
  folders: readonly Folder[],
  { deleted = false } = {},
): T[] {
  const { terms, tags, folders: folderNames } = parseQuery(text);
  const folderIds = new Set(
    folders.filter((f) => folderNames.includes(f.name.toLowerCase())).map((f) => f.id),
  );
  const ranked: { note: T; inTitle: number }[] = [];
  for (const note of notes) {
    if (Boolean(note.deletedAt) !== deleted) continue;
    if (folderNames.length > 0 && !folderIds.has(note.folderId)) continue;
    if (!tags.every((t) => note.tags.includes(t))) continue;
    const title = note.title.toLowerCase();
    const body = note.body.toLowerCase();
    if (!terms.every((t) => title.includes(t) || body.includes(t))) continue;
    ranked.push({ note, inTitle: terms.filter((t) => title.includes(t)).length });
  }
  ranked.sort((a, b) => b.inTitle - a.inTitle || b.note.updatedAt - a.note.updatedAt);
  return ranked.map((r) => r.note);
}
