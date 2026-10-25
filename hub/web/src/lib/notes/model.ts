// Pure helpers over note bodies: titles, tags, links, outline, date groups and link resolution.
import type { Folder, Note, NoteLink, ResolvedLink } from './types.ts';

export const DEFAULT_TITLE = 'New note';
const TITLE_MAX = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const blank = (text: string) => text.replace(/[^\n]/g, ' ');
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Blanks fenced and inline code, keeping offsets, so nothing inside code counts as a tag or link. */
export function maskCode(body: string): string {
  let fence = '';
  const lines = body.split('\n').map((line) => {
    const open = FENCE_RE.exec(line)?.[1];
    if (fence) {
      if (open && open[0] === fence[0] && open.length >= fence.length) fence = '';
      return blank(line);
    }
    if (open) {
      fence = open;
      return blank(line);
    }
    return line;
  });
  return lines.join('\n').replace(/(`+)[^`]*?\1/g, blank);
}

const WIKILINK_RE = /\[\[([^[\]\n]+?)\]\]/g;
const MD_LINK_RE = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/** Blanks code and every kind of link, leaving only prose. */
function maskProse(body: string): string {
  return maskCode(body).replace(WIKILINK_RE, blank).replace(MD_LINK_RE, blank).replace(URL_RE, blank);
}

/** Splits the inside of `[[target#heading|alias]]`. */
export function parseLinkText(inner: string): Pick<NoteLink, 'target' | 'alias' | 'heading'> {
  const bar = inner.indexOf('|');
  const ref = bar < 0 ? inner : inner.slice(0, bar);
  const alias = bar < 0 ? '' : inner.slice(bar + 1).trim();
  const hash = ref.indexOf('#');
  const target = (hash < 0 ? ref : ref.slice(0, hash)).trim();
  const heading = hash < 0 ? '' : ref.slice(hash + 1).trim();
  return { target, ...(heading && { heading }), ...(alias && { alias }) };
}

/** `[[links]]` in `text`, code included, with offsets shifted by `offset`. */
export function findWikiLinks(text: string, offset = 0): NoteLink[] {
  const links: NoteLink[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const parsed = parseLinkText(m[1] ?? '');
    if (parsed.target) links.push({ ...parsed, from: offset + m.index, to: offset + m.index + m[0].length });
  }
  return links;
}

export const parseLinks = (body: string): NoteLink[] => findWikiLinks(maskCode(body));

/** A `#tag` as Obsidian reads it: letters, digits, `_`, `-`, `/`, but not all digits (`#123` is an issue ref). */
export const TAG_RE = /(?<=^|[\s(])#(?!\p{N}+(?![\p{L}\p{N}_/-]))([\p{L}\p{N}_/-]+)/gu;

/** `#tags` in prose, lowercase without `#`. */
export function parseTags(body: string): string[] {
  const tags = new Set<string>();
  for (const m of maskProse(body).matchAll(TAG_RE)) tags.add((m[1] ?? '').toLowerCase());
  return [...tags];
}

const LINE_PREFIX_RE = /^\s*(?:>\s*)*(?:#{1,6}(?:\s+|$))?(?:(?:[-*+]|\d+[.)])\s+)?(?:\[[ xX]\]\s+)?/;
const RULE_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

/** One line of markdown as plain text. */
function plainLine(line: string): string {
  if (RULE_RE.test(line)) return '';
  return line
    .replace(LINE_PREFIX_RE, '')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(WIKILINK_RE, (_, inner: string) => {
      const { target, alias } = parseLinkText(inner);
      return alias ?? target;
    })
    .replace(/\*\*|__|~~|==|`/g, '')
    .replace(/(^|[^\p{L}\p{N}])[*_](\S(?:[^*_]*\S)?)[*_](?![\p{L}\p{N}])/gu, '$1$2')
    .trim();
}

export function noteTitle(body: string): string {
  for (const line of body.split('\n')) {
    const text = plainLine(line);
    if (text) return text.slice(0, TITLE_MAX);
  }
  return DEFAULT_TITLE;
}

/** The first line of text after the title, for the note list. */
export function noteSnippet(body: string, max = 120): string {
  let pastTitle = false;
  for (const line of body.split('\n')) {
    const text = plainLine(line);
    if (!text) continue;
    if (pastTitle) return text.slice(0, max);
    pastTitle = true;
  }
  return '';
}

export interface Heading {
  level: number;
  text: string;
  /** Offset of the heading's line in the body. */
  offset: number;
}

export function outline(body: string): Heading[] {
  const headings: Heading[] = [];
  const masked = maskCode(body);
  let offset = 0;
  for (const line of masked.split('\n')) {
    const m = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    const text = m ? plainLine(m[2] ?? '') : '';
    if (m && text) headings.push({ level: (m[1] ?? '').length, text, offset });
    offset += line.length + 1;
  }
  return headings;
}

export interface DateGroup<T> {
  label: string;
  notes: T[];
}

const startOfDay = (ms: number, daysBack = 0) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
};
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

/** Pinned, Today, Yesterday, Previous 7 and 30 Days, then one group per month; newest first in each. */
export function groupByDate<T extends Pick<Note, 'pinned' | 'updatedAt'>>(
  notes: readonly T[],
  now: number,
): DateGroup<T>[] {
  const bounds: [string, number][] = [
    ['Today', startOfDay(now)],
    ['Yesterday', startOfDay(now, 1)],
    ['Previous 7 Days', startOfDay(now, 7)],
    ['Previous 30 Days', startOfDay(now, 30)],
  ];
  const groups = new Map<string, T[]>();
  const add = (label: string, n: T) => {
    const list = groups.get(label);
    if (list) list.push(n);
    else groups.set(label, [n]);
  };
  // Seeded in display order; empty ones are dropped at the end.
  for (const label of ['Pinned', ...bounds.map(([l]) => l)]) groups.set(label, []);
  for (const n of [...notes].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (n.pinned) add('Pinned', n);
    else add(bounds.find(([, start]) => n.updatedAt >= start)?.[0] ?? MONTH.format(n.updatedAt), n);
  }
  return [...groups].filter(([, list]) => list.length > 0).map(([label, list]) => ({ label, notes: list }));
}

export const daysLeft = (deletedAt: number, now: number, keepDays: number) =>
  Math.max(0, Math.ceil((deletedAt + keepDays * DAY_MS - now) / DAY_MS));

/** Today's daily-note title, `YYYY-MM-DD` in local time. */
export function dailyTitle(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface LinkContext {
  notes: readonly Pick<Note, 'id' | 'title' | 'updatedAt' | 'deletedAt'>[];
  /** The linking note's project, whose memory notes are the fallback. */
  project?: string;
  memoryNames?: readonly string[];
}

/** A note title (case-insensitive, newest wins), then a memory note in the note's project. */
export function resolveLink(target: string, { notes, project, memoryNames = [] }: LinkContext): ResolvedLink {
  const key = target.trim().toLowerCase();
  let best: (typeof notes)[number] | undefined;
  for (const n of notes) {
    if (n.deletedAt || n.title.toLowerCase() !== key) continue;
    if (!best || n.updatedAt > best.updatedAt) best = n;
  }
  if (best) return { kind: 'note', noteId: best.id };
  const memory = project ? memoryNames.find((name) => name.toLowerCase() === key) : undefined;
  if (project && memory) return { kind: 'memory', project, name: memory };
  return { kind: 'unresolved', target };
}

/** Live notes with a `[[link]]` to this note's title. */
export function linkedMentions<T extends Note>(note: Note, notes: readonly T[]): T[] {
  const key = note.title.toLowerCase();
  return notes.filter(
    (n) => n.id !== note.id && !n.deletedAt && parseLinks(n.body).some((l) => l.target.toLowerCase() === key),
  );
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentionRe = (title: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(title)}(?![\\p{L}\\p{N}_])`, 'iu');

export interface Mention<T> {
  note: T;
  snippet: string;
}

/** Live notes that name this note in prose without linking it. */
export function unlinkedMentions<T extends Note>(note: Note, notes: readonly T[]): Mention<T>[] {
  if (!note.body.trim()) return [];
  const re = mentionRe(note.title);
  const linked = new Set(linkedMentions(note, notes).map((n) => n.id));
  const found: Mention<T>[] = [];
  for (const n of notes) {
    if (n.id === note.id || n.deletedAt || linked.has(n.id)) continue;
    const m = re.exec(maskProse(n.body));
    if (!m) continue;
    const start = Math.max(0, m.index - 40);
    const text = n.body.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ');
    found.push({ note: n, snippet: `${start > 0 ? '…' : ''}${text.trim()}` });
  }
  return found;
}

/** Wraps the first plain mention of `title` in `[[...]]`. */
export function linkMention(body: string, title: string): string {
  const m = mentionRe(title).exec(maskProse(body));
  if (!m) return body;
  const end = m.index + m[0].length;
  return `${body.slice(0, m.index)}[[${body.slice(m.index, end)}]]${body.slice(end)}`;
}

const TASK_RE = /^[ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\]/;

/** Offset of the ` `/`x` inside the checkbox of the list item that starts at `offset`, if it has one. */
export function taskMarkAt(text: string, offset: number): number | undefined {
  const m = TASK_RE.exec(text.slice(offset));
  return m ? offset + m[0].length - 2 : undefined;
}

/** Ticks or unticks the checkbox of the list item that starts at `offset`. */
export function toggleTask(body: string, offset: number): string {
  const at = taskMarkAt(body, offset);
  if (at === undefined) return body;
  return `${body.slice(0, at)}${body[at] === ' ' ? 'x' : ' '}${body.slice(at + 1)}`;
}

export interface FolderRow {
  folder: Folder;
  depth: number;
  /** Names from the top, joined with ` / `. */
  path: string;
}

/** Folders depth first, siblings by name; a folder whose parent is gone shows at the top. */
export function folderTree(folders: readonly Folder[]): FolderRow[] {
  const ids = new Set(folders.map((f) => f.id));
  const byName = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  const rows: FolderRow[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | undefined, depth: number, prefix: string) => {
    for (const folder of byName) {
      const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : undefined;
      if (parent !== parentId || seen.has(folder.id)) continue;
      seen.add(folder.id);
      const path = prefix ? `${prefix} / ${folder.name}` : folder.name;
      rows.push({ folder, depth, path });
      walk(folder.id, depth + 1, path);
    }
  };
  walk(undefined, 0, '');
  // Folders in a parent cycle never reach the top level above.
  for (const folder of byName) {
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    rows.push({ folder, depth: 0, path: folder.name });
    walk(folder.id, 1, folder.name);
  }
  return rows;
}
