import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import type { Heading, Mention } from '@/lib/notes/model';
import type { Note } from '@/lib/notes/types';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function NoteLink({ note, children }: { note: Note; children?: ReactNode }) {
  return (
    <Link
      to="/notes/$id"
      params={{ id: note.id }}
      search={(prev) => prev}
      className="block rounded px-1 py-0.5 text-sm hover:bg-accent"
    >
      <span className="block truncate font-medium">{note.title}</span>
      {children}
    </Link>
  );
}

/** Notion-style outline: one bar per heading on the editor's edge, the list on hover or focus. */
export function NoteOutline({
  headings,
  onHeading,
}: {
  headings: readonly Heading[];
  onHeading: (index: number) => void;
}) {
  if (headings.length === 0) return null;
  const top = Math.min(...headings.map((h) => h.level));
  return (
    <nav aria-label="Outline" className="w-10 shrink-0 pt-10">
      <div className="group relative flex justify-center">
        <ul
          aria-hidden
          className="flex flex-col items-end gap-2 py-2 group-focus-within:invisible group-hover:invisible"
        >
          {headings.map((h) => (
            <li
              key={`${h.offset}`}
              className="h-0.5 rounded-full bg-muted-foreground/40"
              style={{ width: `${Math.max(6, 18 - (h.level - top) * 4)}px` }}
            />
          ))}
        </ul>
        <ul className="absolute top-0 right-2 z-10 hidden max-h-[60vh] w-64 overflow-auto rounded-lg border bg-background p-1.5 shadow-lg group-focus-within:block group-hover:block">
          {headings.map((h, i) => (
            <li key={`${h.offset}`} style={{ paddingLeft: `${(h.level - top) * 0.75}rem` }}>
              <button
                type="button"
                onClick={() => onHeading(i)}
                className="w-full truncate rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** "N backlinks" under the note's date, opening the linked and unlinked mentions. */
export function NoteBacklinks({
  linked,
  unlinked,
  onLinkMention,
}: {
  linked: readonly Note[];
  unlinked: readonly Mention<Note>[];
  onLinkMention: (note: Note) => void;
}) {
  const [open, setOpen] = useState(false);
  if (linked.length === 0 && unlinked.length === 0) return null;
  const label = [
    linked.length > 0 && `${linked.length} ${linked.length === 1 ? 'backlink' : 'backlinks'}`,
    unlinked.length > 0 && `${unlinked.length} unlinked`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="px-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {label}
      </button>
      {open && (
        <div className="mt-1 space-y-3 rounded-md border p-2">
          {linked.length > 0 && (
            <Section title="Linked mentions">
              <ul>
                {linked.map((n) => (
                  <li key={n.id}>
                    <NoteLink note={n} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {unlinked.length > 0 && (
            <Section title="Unlinked mentions">
              <ul className="space-y-1">
                {unlinked.map((m) => (
                  <li key={m.note.id} className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <NoteLink note={m.note}>
                        <span className="block text-xs text-muted-foreground">{m.snippet}</span>
                      </NoteLink>
                    </div>
                    <button
                      type="button"
                      onClick={() => onLinkMention(m.note)}
                      className="shrink-0 rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
                    >
                      Link
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
