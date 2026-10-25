import { describe, expect, it } from 'vitest';
import { shortcutOf } from './shortcuts.ts';

const keys = (
  code: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {},
) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe('shortcutOf', () => {
  it('maps the Notes shortcuts with Ctrl or Cmd', () => {
    expect(shortcutOf(keys('KeyN', { ctrl: true, alt: true }))).toBe('new');
    expect(shortcutOf(keys('KeyO', { meta: true }))).toBe('switcher');
    expect(shortcutOf(keys('KeyE', { ctrl: true }))).toBe('mode');
    expect(shortcutOf(keys('KeyF', { ctrl: true, shift: true }))).toBe('search');
    expect(shortcutOf(keys('KeyD', { meta: true, shift: true }))).toBe('daily');
  });

  it('ignores other combinations', () => {
    expect(shortcutOf(keys('KeyO'))).toBeUndefined();
    expect(shortcutOf(keys('KeyN', { ctrl: true }))).toBeUndefined();
    expect(shortcutOf(keys('KeyN', { ctrl: true, alt: true, shift: true }))).toBeUndefined();
    expect(shortcutOf(keys('KeyO', { ctrl: true, shift: true }))).toBeUndefined();
    expect(shortcutOf(keys('KeyF', { ctrl: true, alt: true }))).toBeUndefined();
    expect(shortcutOf(keys('KeyE', { ctrl: true, alt: true }))).toBeUndefined();
  });
});
