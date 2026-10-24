import { useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const STORAGE_KEY = 'talk-first-hub:theme';

let mode: ThemeMode = 'system';
let media: MediaQueryList | undefined;
const listeners = new Set<() => void>();

// Storage can throw (blocked site data, private windows); the theme still works without it.
function readStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value !== null && Object.hasOwn(NEXT, value) ? (value as ThemeMode) : 'system';
  } catch {
    return 'system';
  }
}

function apply() {
  document.documentElement.classList.toggle('dark', isDark());
  for (const notify of listeners) notify();
}

/** Call once before the first render so the page never flashes the wrong theme. */
export function initTheme() {
  mode = readStoredMode();
  media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', () => {
    if (mode === 'system') apply();
  });
  apply();
}

export function nextThemeMode(current: ThemeMode): ThemeMode {
  return NEXT[current];
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function isDark(): boolean {
  return mode === 'dark' || (mode === 'system' && Boolean(media?.matches));
}

export function setThemeMode(next: ThemeMode) {
  mode = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  apply();
}

export function subscribeTheme(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode);
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeTheme, isDark);
}
