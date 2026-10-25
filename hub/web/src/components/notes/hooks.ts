import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { get } from '@/lib/api';
import { AttachmentUrls, type NotesStore } from '@/lib/notes/store';
import type { Folder, Note } from '@/lib/notes/types';
import { LIST_LIMIT_MAX, type MemoryPage } from '../../../../server/types.ts';

/** Every note and folder, kept live across tabs; undefined until the first read. */
export function useNotesData(store: NotesStore): { notes?: Note[]; folders?: Folder[] } {
  const notes = useLiveQuery(() => store.db.notes.toArray(), [store]);
  const folders = useLiveQuery(() => store.db.folders.toArray(), [store]);
  return { notes, folders };
}

/** Memory note names in a project, for `[[link]]` fallback and completion. */
export function useMemoryNames(project: string | undefined): readonly string[] {
  const query = useQuery({
    queryKey: ['memory-names', project],
    enabled: Boolean(project),
    queryFn: () =>
      get<MemoryPage>(`/projects/${encodeURIComponent(project ?? '')}/memory?limit=${LIST_LIMIT_MAX}`),
    select: (page) => page.items.map((n) => n.name),
  });
  return query.data ?? NO_NAMES;
}
const NO_NAMES: readonly string[] = [];

/**
 * Blob URLs for attachments, revoked on unmount. The resolver changes identity whenever one loads,
 * so views using it re-render.
 */
export function useAttachmentUrls(store: NotesStore) {
  const [urls, setUrls] = useState<AttachmentUrls>();
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    // Made in the effect, so StrictMode's second mount doesn't get a disposed instance.
    const next = new AttachmentUrls((id) => store.attachmentBlob(id));
    const off = next.subscribe(bump);
    setUrls(next);
    return () => {
      off();
      next.dispose();
    };
  }, [store]);
  // `version` changes the identity once a URL loads.
  const resolve = useCallback((id: string) => urls?.get(id), [urls, version]);
  const retryMissing = useCallback(() => {
    urls?.retryMissing();
    bump();
  }, [urls]);
  return { resolve, retryMissing };
}
