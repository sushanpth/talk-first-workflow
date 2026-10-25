import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
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

const None = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

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

/** Outline and backlinks beside the open note. */
export function NotePanel({
  headings,
  linked,
  unlinked,
  onHeading,
  onLinkMention,
}: {
  headings: readonly Heading[];
  linked: readonly Note[];
  unlinked: readonly Mention<Note>[];
  onHeading: (index: number) => void;
  onLinkMention: (note: Note) => void;
}) {
  return (
    <div className="space-y-5 p-3">
      <Section title="Outline">
        {headings.length === 0 ? (
          <None>No headings.</None>
        ) : (
          <ul>
            {headings.map((h, i) => (
              <li key={`${h.offset}`} style={{ paddingLeft: `${(h.level - 1) * 0.75}rem` }}>
                <button
                  type="button"
                  onClick={() => onHeading(i)}
                  className="w-full truncate rounded px-1 py-0.5 text-left text-sm hover:bg-accent"
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Linked mentions">
        {linked.length === 0 ? (
          <None>No notes link here.</None>
        ) : (
          <ul>
            {linked.map((n) => (
              <li key={n.id}>
                <NoteLink note={n} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Unlinked mentions">
        {unlinked.length === 0 ? (
          <None>None.</None>
        ) : (
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
        )}
      </Section>
    </div>
  );
}
