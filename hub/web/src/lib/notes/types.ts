// Shared contract for the Notes page: Dexie rows, parsed links and the editor's props.
// Ids are random UUIDs; times are epoch milliseconds.

/** Image refs in a note body are `![name](attachment:<id>)`. */
export const ATTACHMENT_SCHEME = 'attachment:';

/** Folder id of a note outside any folder; IndexedDB can't index null or undefined. */
export const NO_FOLDER = '';

export interface Note {
  id: string;
  /** Derived from the body's first non-empty line on every save. */
  title: string;
  body: string;
  folderId: string;
  /** Hub project id; `[[links]]` fall back to this project's memory notes. */
  project?: string;
  /** Lowercase, without the leading `#`. */
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** Set while the note is in Recently Deleted. */
  deletedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
}

export interface Attachment {
  id: string;
  noteId: string;
  mime: string;
  name: string;
  blob: Blob;
  createdAt: number;
}

/** A `[[target#heading|alias]]` in a note body. */
export interface NoteLink {
  target: string;
  alias?: string;
  heading?: string;
  /** Offsets of the whole `[[...]]` in the body. */
  from: number;
  to: number;
}

export type ResolvedLink =
  | { kind: 'note'; noteId: string }
  | { kind: 'memory'; project: string; name: string }
  | { kind: 'unresolved'; target: string };

/** A `[[` completion: a note title, or a memory note name in the note's project. */
export interface LinkTarget {
  label: string;
  kind: 'note' | 'memory';
}

/**
 * Props of components/notes/editor.tsx, which knows nothing about Dexie.
 * Remount it with `key={note.id}` to switch notes so undo history doesn't cross them.
 */
export interface EditorProps {
  /** A value that differs from the editor's doc (import, another tab) replaces it. */
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  dark: boolean;
  autoFocus?: boolean;
  /** The store flushes its debounced save here. */
  onBlur?: () => void;
  /** Read when completion opens, so the editor never holds a stale list. */
  linkTargets: () => readonly LinkTarget[];
  /** Existing tags, lowercase, without `#`. */
  tags: () => readonly string[];
  /** Ctrl/Cmd+click on a `[[link]]`. */
  onOpenLink: (link: NoteLink) => void;
  /** Saves a pasted or dropped image and returns its attachment id. */
  onPasteImage: (file: File) => Promise<string>;
  /** Blob URL for an attachment id, or undefined while it's missing. */
  resolveAttachment: (id: string) => string | undefined;
}
