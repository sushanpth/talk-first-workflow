// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemeMode, initTheme } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle.tsx';

// jsdom has neither; Radix measures the menu and theme.ts reads the OS scheme.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  localStorage.clear();
  initTheme();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThemeToggle', () => {
  it('opens a menu of the three modes and switches to the chosen one', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Theme: system' }));

    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(screen.getByRole('menuitemradio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');

    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    expect(getThemeMode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Theme: dark' })).toBeTruthy();
  });
});
