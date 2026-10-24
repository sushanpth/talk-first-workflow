import { describe, expect, it } from 'vitest';
import { parseOpenArgs } from './launcher.ts';

const cwd = '/work/repo';

describe('parseOpenArgs', () => {
  it('opens a plan by path', () => {
    expect(parseOpenArgs(['plan', 'plans/a.md'], cwd)).toEqual({
      query: { kind: 'plan', path: '/work/repo/plans/a.md' },
      register: cwd,
      printUrl: false,
    });
  });

  it('opens a project by repo', () => {
    expect(parseOpenArgs(['project', '../other'], cwd)).toEqual({
      query: { kind: 'project', repo: '/work/other' },
      register: '/work/other',
      printUrl: false,
    });
  });

  it('falls back to the current folder for a bare project', () => {
    expect(parseOpenArgs(['project'], cwd)).toEqual({
      query: { kind: 'project', repo: cwd },
      register: cwd,
      printUrl: false,
    });
  });

  it('passes --base through for a worktree', () => {
    expect(parseOpenArgs(['worktree', '/wt/a', '--base', 'abc123'], cwd)).toEqual({
      query: { kind: 'worktree', path: '/wt/a', base: 'abc123' },
      register: '/wt/a',
      printUrl: false,
    });
  });

  it('accepts --print-url before or after the target', () => {
    const expected = {
      query: { kind: 'plan', path: '/work/repo/a.md' },
      register: cwd,
      printUrl: true,
    };
    expect(parseOpenArgs(['--print-url', 'plan', 'a.md'], cwd)).toEqual(expected);
    expect(parseOpenArgs(['plan', 'a.md', '--print-url'], cwd)).toEqual(expected);
  });

  it('rejects --base without a commit', () => {
    expect(() => parseOpenArgs(['worktree', '/wt/a', '--base'], cwd)).toThrow('--base needs a commit');
  });
});
