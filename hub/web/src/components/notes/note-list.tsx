import { Link } from '@tanstack/react-router';
import { Pin } from 'lucide-react';
import { type DateGroup, noteSnippet } from '@/lib/notes/model';
import type { Note } from '@/lib/notes/types';
import { cn } from '@/lib/utils';

/** A time for today's edits, else a short date, as macOS Notes does. */
export function shortWhen(ms: number, now: number): string {
  const d = new Date(ms);
  return d.toDateString() === new Date(now).toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { dateStyle: 'short' });
}

function Row({ note, selected, now, aside }: { note: Note; selected: boolean; now: number; aside?: string }) {
  const snippet = noteSnippet(note.body);
  return (
    <li>
      <Link
        to="/notes/$id"
        params={{ id: note.id }}
        search={(prev) => prev}
        aria-current={selected || undefined}
        className={cn('block rounded-md px-3 py-2 hover:bg-accent', selected && 'bg-accent')}
      >
        <div className="flex items-center gap-1 text-sm font-medium">
          {note.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" />}
          <span className="truncate">{note.title}</span>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <time dateTime={new Date(note.updatedAt).toISOString()} className="shrink-0">
            {aside ?? shortWhen(note.updatedAt, now)}
          </time>
          <span className="truncate">{snippet || 'No additional text'}</span>
        </div>
      </Link>
    </li>
  );
}

export function NoteList({
  groups,
  selectedId,
  now,
  asideOf,
  empty,
}: {
  groups: readonly DateGroup<Note>[];
  selectedId: string | undefined;
  now: number;
  /** Replaces the date, e.g. days left in Recently Deleted. */
  asideOf?: (note: Note) => string;
  empty: string;
}) {
  if (groups.length === 0) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-3 p-2">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          {g.label && <h3 className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{g.label}</h3>}
          <ul>
            {g.notes.map((n) => (
              <Row key={n.id} note={n} selected={n.id === selectedId} now={now} aside={asideOf?.(n)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
