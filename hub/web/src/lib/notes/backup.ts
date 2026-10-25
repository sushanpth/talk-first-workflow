// Backup as a zip of `.md` files Obsidian can open: folders as directories, metadata as front matter,
// images under `attachments/` linked by relative path.
import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import type { NotesDb } from './db.ts';
import { noteTitle, parseTags } from './model.ts';
import { newId } from './store.ts';
import { ATTACHMENT_SCHEME, type Attachment, type Folder, NO_FOLDER, type Note } from './types.ts';

export const ATTACHMENTS_DIR = 'attachments';

export interface BackupEntry {
  path: string;
  data: Uint8Array;
}

/** What one or more picked files hold: entries to import, and paths left out. */
export interface BackupFiles {
  entries: BackupEntry[];
  /** Not a note or image, or over the size caps. */
  ignored: string[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  attachments: number;
  ignored: string[];
}

const NAME_MAX = 100;

/** A name safe as a file or directory on Windows, macOS and Linux. */
function safeName(name: string, fallback: string): string {
  const clean = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it strips.
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, NAME_MAX)
    .trim();
  return clean || fallback;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ATTACHMENT_REF_RE = new RegExp(`\\]\\(${ATTACHMENT_SCHEME}([0-9a-f-]{36})\\)`, 'gi');

const attachmentFile = (a: Attachment) => `${a.id}-${safeName(a.name, 'file')}`;

/** Percent-encoded so spaces and parentheses can't end the markdown link early. */
const linkPath = (path: string) =>
  encodeURI(path).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);

const frontMatter = (n: Note) =>
  [
    '---',
    `id: ${n.id}`,
    `pinned: ${n.pinned}`,
    `tags: ${JSON.stringify(n.tags).replaceAll(',', ', ')}`,
    ...(n.project ? [`project: ${JSON.stringify(n.project)}`] : []),
    `created: ${new Date(n.createdAt).toISOString()}`,
    `updated: ${new Date(n.updatedAt).toISOString()}`,
    '---',
    '',
  ].join('\n');

/** Every note outside Recently Deleted, with its attachments, as zip bytes. */
export async function exportNotes(db: NotesDb): Promise<Uint8Array> {
  const [notes, folders, attachments] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.attachments.toArray(),
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const dirOf = (id: string, seen = new Set<string>()): string[] => {
    const f = byId.get(id);
    if (!f || seen.has(id)) return [];
    seen.add(id);
    return [...(f.parentId ? dirOf(f.parentId, seen) : []), safeName(f.name, 'Folder')];
  };

  const live = notes
    .filter((n) => !n.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const liveIds = new Set(live.map((n) => n.id));
  const files: Zippable = {};
  const fileOf = new Map<string, string>();
  for (const a of attachments) {
    if (!liveIds.has(a.noteId)) continue;
    const file = attachmentFile(a);
    fileOf.set(a.id, file);
    // Images are already compressed.
    files[`${ATTACHMENTS_DIR}/${file}`] = [new Uint8Array(await a.blob.arrayBuffer()), { level: 0 }];
  }

  const taken = new Set<string>();
  for (const n of live) {
    const dir = dirOf(n.folderId);
    const prefix = dir.map((d) => `${d}/`).join('');
    const base = safeName(n.title, 'Untitled');
    let path = `${prefix}${base}.md`;
    for (let i = 2; taken.has(path.toLowerCase()); i++) path = `${prefix}${base} (${i}).md`;
    taken.add(path.toLowerCase());
    const up = '../'.repeat(dir.length);
    const body = n.body.replace(ATTACHMENT_REF_RE, (ref, id: string) => {
      const file = fileOf.get(id.toLowerCase());
      return file ? `](${linkPath(`${up}${ATTACHMENTS_DIR}/${file}`)})` : ref;
    });
    files[path] = strToU8(frontMatter(n) + body);
  }
  return zipSync(files);
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

// SVG is left out: opened from its blob URL, it could run script in the hub's origin.
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
};
const extOf = (path: string) => path.split('.').pop()?.toLowerCase() ?? '';
const importable = (path: string) => extOf(path) === 'md' || extOf(path) in MIME;
const JUNK_RE = /(^|\/)(__MACOSX|\.obsidian|\.trash)\/|(^|\/)\.DS_Store$/;

/** The files to import from one picked file: a zip's notes and images, or the file itself. */
export function backupEntries(name: string, data: Uint8Array): BackupFiles {
  if (!name.toLowerCase().endsWith('.zip')) {
    return importable(name) && data.length <= MAX_FILE_BYTES
      ? { entries: [{ path: name, data }], ignored: [] }
      : { entries: [], ignored: [name] };
  }
  const ignored: string[] = [];
  let total = 0;
  // Sizes come from the zip's headers; fflate inflates into buffers of exactly that size.
  const files = unzipSync(data, {
    filter: ({ name: path, originalSize }) => {
      if (path.endsWith('/') || JUNK_RE.test(path)) return false;
      const ok =
        importable(path) && originalSize <= MAX_FILE_BYTES && total + originalSize <= MAX_TOTAL_BYTES;
      if (ok) total += originalSize;
      else ignored.push(path);
      return ok;
    },
  });
  return { entries: Object.entries(files).map(([path, bytes]) => ({ path, data: bytes })), ignored };
}

type Meta = Record<string, string | boolean | string[]>;

function scalar(raw: string): string | boolean | string[] {
  const value = raw.trim();
  if (value === 'true' || value === 'false') return value === 'true';
  if (value.startsWith('"') || value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return value.replace(/^'(.*)'$/, '$1');
}

/** The simple YAML subset the export writes, plus block lists; anything else is ignored. */
function splitFrontMatter(text: string): { meta: Meta; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Meta = {};
  let listKey = '';
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const list = meta[listKey];
      if (Array.isArray(list)) list.push(String(scalar(item[1] ?? '')));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key = '', value = ''] = kv;
    listKey = value.trim() ? '' : key;
    meta[key] = value.trim() ? scalar(value) : [];
  }
  return { meta, body: text.slice(m[0].length) };
}

const mimeOf = (path: string) => MIME[extOf(path)] ?? 'application/octet-stream';

/** Joins a relative link onto a directory, resolving `.` and `..`; null when it climbs out. */
function resolvePath(dir: string[], href: string): string | null {
  const parts = [...dir];
  for (const seg of href.split('/')) {
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const LINK_DEST_RE = /\]\((<[^>\n]*>|[^)\s]+)\)/g;
const time = (value: unknown, fallback: number) => {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ms) ? fallback : ms;
};

/** Imports `.md` files and the images they link; a note with a known id is replaced only by a newer copy. */
export async function importBackup(
  db: NotesDb,
  { entries, ignored }: BackupFiles,
  now: number = Date.now(),
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, attachments: 0, ignored: [...ignored] };
  const files = new Map(
    entries
      .filter((e) => !e.path.endsWith('/') && !JUNK_RE.test(e.path) && importable(e.path))
      .map((e) => [e.path, e]),
  );
  const attachmentIds = new Map<string, string>();

  await db.transaction('rw', db.notes, db.folders, db.attachments, async () => {
    const folders = await db.folders.toArray();
    const folderFor = async (dir: string[]): Promise<string> => {
      let parentId: string | undefined;
      for (const name of dir) {
        let folder: Folder | undefined = folders.find(
          (f) => f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase(),
        );
        if (!folder) {
          folder = { id: newId(), name, ...(parentId && { parentId }) };
          folders.push(folder);
          await db.folders.add(folder);
        }
        parentId = folder.id;
      }
      return parentId ?? NO_FOLDER;
    };

    for (const entry of files.values()) {
      if (!entry.path.toLowerCase().endsWith('.md')) continue;
      const { meta, body: raw } = splitFrontMatter(strFromU8(entry.data));
      const dir = entry.path.split('/').slice(0, -1);
      const id = typeof meta.id === 'string' && meta.id ? meta.id : newId();
      const updatedAt = time(meta.updated, now);

      const linked: { path: string; id: string }[] = [];
      const body = raw.replace(LINK_DEST_RE, (ref, dest: string) => {
        let href = dest.startsWith('<') ? dest.slice(1, -1) : dest;
        try {
          href = decodeURI(href);
        } catch {}
        const path = /^[a-z][a-z0-9+.-]*:/i.test(href) ? null : resolvePath(dir, href);
        if (!path || path.toLowerCase().endsWith('.md') || !files.has(path)) return ref;
        const file = path.split('/').pop() ?? '';
        const known = attachmentIds.get(path) ?? UUID_RE.exec(file)?.[0]?.toLowerCase() ?? newId();
        attachmentIds.set(path, known);
        linked.push({ path, id: known });
        return `](${ATTACHMENT_SCHEME}${known})`;
      });

      for (const { path, id: attachmentId } of linked) {
        if (await db.attachments.get(attachmentId)) continue;
        const file = path.split('/').pop() ?? 'file';
        const data = files.get(path)?.data ?? new Uint8Array();
        const mime = mimeOf(file);
        await db.attachments.add({
          id: attachmentId,
          noteId: id,
          mime,
          name: UUID_RE.test(file) ? file.slice(37) || file : file,
          blob: new Blob([data.slice()], { type: mime }),
          createdAt: now,
        });
        result.attachments++;
      }

      const existing = await db.notes.get(id);
      // A tie goes to the backup only when it would bring back a deleted note.
      if (
        existing &&
        (existing.updatedAt > updatedAt || (existing.updatedAt === updatedAt && !existing.deletedAt))
      ) {
        result.skipped++;
        continue;
      }
      const project = typeof meta.project === 'string' && meta.project ? meta.project : undefined;
      const note: Note = {
        id,
        body,
        title: noteTitle(body),
        tags: parseTags(body),
        folderId: await folderFor(dir),
        ...(project && { project }),
        pinned: meta.pinned === true,
        createdAt: time(meta.created, existing?.createdAt ?? now),
        updatedAt,
      };
      await db.notes.put(note);
      if (existing) result.updated++;
      else result.added++;
    }
  });
  return result;
}
