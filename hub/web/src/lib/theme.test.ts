import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'talk-first-hub:theme';

let stored: Record<string, string>;
let classes: Set<string>;
let osDark: boolean;
let mediaListeners: Set<() => void>;

function stubBrowser({ storageThrows = false } = {}) {
  const fail = () => {
    throw new Error('storage blocked');
  };
  vi.stubGlobal('localStorage', {
    getItem: storageThrows ? fail : (k: string) => stored[k] ?? null,
    setItem: storageThrows
      ? fail
      : (k: string, v: string) => {
          stored[k] = v;
        },
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({
      get matches() {
        return osDark;
      },
      addEventListener: (_: string, l: () => void) => mediaListeners.add(l),
      removeEventListener: (_: string, l: () => void) => mediaListeners.delete(l),
    }),
  });
  vi.stubGlobal('document', {
    documentElement: {
      classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) },
    },
  });
}

async function loadTheme() {
  const theme = await import('./theme.ts');
  theme.initTheme();
  return theme;
}

const setOsDark = (dark: boolean) => {
  osDark = dark;
  for (const l of mediaListeners) l();
};

beforeEach(() => {
  stored = {};
  classes = new Set();
  osDark = false;
  mediaListeners = new Set();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme', () => {
  it('cycles system, light, dark and back to system', async () => {
    stubBrowser();
    const { nextThemeMode } = await loadTheme();
    expect(nextThemeMode('system')).toBe('light');
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
  });

  it('follows the OS live on system, and ignores it once a mode is chosen', async () => {
    stubBrowser();
    const { getThemeMode, isDark, setThemeMode } = await loadTheme();
    expect(getThemeMode()).toBe('system');
    expect(isDark()).toBe(false);
    setOsDark(true);
    expect(isDark()).toBe(true);
    expect(classes.has('dark')).toBe(true);

    setThemeMode('light');
    expect(isDark()).toBe(false);
    expect(classes.has('dark')).toBe(false);
    setOsDark(false);
    setOsDark(true);
    expect(classes.has('dark')).toBe(false);
  });

  it('applies the dark class and stores the choice', async () => {
    stubBrowser();
    const { setThemeMode, subscribeTheme } = await loadTheme();
    const notify = vi.fn();
    subscribeTheme(notify);
    setThemeMode('dark');
    expect(classes.has('dark')).toBe(true);
    expect(stored[KEY]).toBe('dark');
    expect(notify).toHaveBeenCalled();
  });

  it('restores a stored mode on load', async () => {
    stored[KEY] = 'dark';
    stubBrowser();
    const { getThemeMode } = await loadTheme();
    expect(getThemeMode()).toBe('dark');
    expect(classes.has('dark')).toBe(true);
  });

  it('falls back to system when the stored value is junk', async () => {
    stored[KEY] = 'purple';
    osDark = true;
    stubBrowser();
    const { getThemeMode } = await loadTheme();
    expect(getThemeMode()).toBe('system');
    expect(classes.has('dark')).toBe(true);
  });

  it('falls back to system and still switches when storage throws', async () => {
    stubBrowser({ storageThrows: true });
    const { getThemeMode, setThemeMode } = await loadTheme();
    expect(getThemeMode()).toBe('system');
    setThemeMode('dark');
    expect(getThemeMode()).toBe('dark');
    expect(classes.has('dark')).toBe(true);
  });
});
