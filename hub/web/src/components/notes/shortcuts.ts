import { useEffect, useRef } from 'react';

export type NotesShortcut = 'new' | 'switcher' | 'mode' | 'search' | 'daily';

type Keys = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'code'>;

/** The Notes shortcut a key press means, if any. */
export function shortcutOf(e: Keys): NotesShortcut | undefined {
  if (!(e.ctrlKey || e.metaKey)) return undefined;
  // `code`, not `key`: Alt and Shift change the key's character on some layouts.
  if (e.altKey) return !e.shiftKey && e.code === 'KeyN' ? 'new' : undefined;
  if (e.shiftKey) return e.code === 'KeyF' ? 'search' : e.code === 'KeyD' ? 'daily' : undefined;
  return e.code === 'KeyO' ? 'switcher' : e.code === 'KeyE' ? 'mode' : undefined;
}

/** Runs the matching handler for Notes shortcuts while mounted. */
export function useNotesShortcuts(handlers: Record<NotesShortcut, () => void>): void {
  // Read through a ref so the listener, added once, always calls the latest handlers.
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutOf(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current[action]();
    };
    // Capture phase, so the editor never swallows these first.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
