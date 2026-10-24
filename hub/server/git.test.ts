import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { git, makeFixture, write } from './fixtures.test-helper.ts';
import {
  changedFiles,
  defaultBase,
  fileOnDisk,
  listWorktrees,
  parseNameStatus,
  parseWorktreeList,
  resolveCommit,
} from './git.ts';

describe('parseNameStatus', () => {
  it('parses plain, rename and copy entries', () => {
    const out = [
      'M',
      'src/a.ts',
      'A',
      'new file.md',
      'D',
      'gone.txt',
      'R087',
      'old/x.ts',
      'new/x.ts',
      'C100',
      'a',
      'b',
      '',
    ];
    expect(parseNameStatus(out.join('\0'))).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'A', path: 'new file.md' },
      { status: 'D', path: 'gone.txt' },
      { status: 'R', path: 'new/x.ts', oldPath: 'old/x.ts' },
      { status: 'C', path: 'b', oldPath: 'a' },
    ]);
  });

  it('keeps paths with newlines and tabs intact', () => {
    expect(parseNameStatus('M\0we\tird\nname\0')).toEqual([{ status: 'M', path: 'we\tird\nname' }]);
  });

  it('handles empty and truncated output', () => {
    expect(parseNameStatus('')).toEqual([]);
    expect(parseNameStatus('R100\0only-old\0')).toEqual([]);
  });
});

describe('parseWorktreeList', () => {
  it('reads main, branch, detached and bare entries', () => {
    const out = [
      'worktree /repo',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/.claude/worktrees/agent-1',
      'HEAD bbb',
      'branch refs/heads/feature/x',
      'locked',
      '',
      'worktree /tmp/detached',
      'HEAD ccc',
      'detached',
      '',
      '',
    ].join('\0');
    expect(parseWorktreeList(out)).toEqual([
      { path: '/repo', head: 'aaa', branch: 'main', bare: false },
      { path: '/repo/.claude/worktrees/agent-1', head: 'bbb', branch: 'feature/x', bare: false },
      { path: '/tmp/detached', head: 'ccc', branch: null, bare: false },
    ]);
  });
});

describe('worktree diffs', () => {
  let tmp = '';
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('includes committed, uncommitted and untracked changes against the merge-base', async () => {
    const fx = makeFixture();
    tmp = fx.tmp;
    const wt = join(fx.repo, '.claude', 'worktrees', 'agent-1');
    git(fx.repo, 'worktree', 'add', '-q', '-b', 'agent-1', wt);
    write(join(wt, 'src', 'app.txt'), 'one\nTWO\n');
    git(wt, 'commit', '-qam', 'change app');
    git(wt, 'mv', 'docs/guide.md', 'docs/handbook.md');
    write(join(wt, 'notes.txt'), 'untracked\n');
    // A later commit on main must not show up in the worktree's diff.
    write(join(fx.repo, 'README.md'), '# Shop v2\n');
    git(fx.repo, 'commit', '-qam', 'main moves on');

    const [tree] = await listWorktrees(fx.repo);
    expect(tree).toMatchObject({ name: 'agent-1', path: wt, branch: 'agent-1' });
    const base = await defaultBase(fx.repo, wt);
    expect(base).toBe(git(fx.repo, 'rev-parse', 'main~1').trim());
    expect(await changedFiles(wt, base)).toEqual([
      { status: 'R', path: 'docs/handbook.md', oldPath: 'docs/guide.md' },
      { status: 'M', path: 'src/app.txt' },
      { status: '?', path: 'notes.txt' },
    ]);
  });

  it('refuses refs that could read as options', async () => {
    const fx = makeFixture();
    tmp = fx.tmp;
    expect(await resolveCommit(fx.repo, '--output=/tmp/x')).toBeNull();
    expect(await resolveCommit(fx.repo, 'nope')).toBeNull();
    expect(await resolveCommit(fx.repo, 'main')).toBe(git(fx.repo, 'rev-parse', 'main').trim());
  });

  it('reads files on disk but refuses a FIFO without hanging', async () => {
    const fx = makeFixture();
    tmp = fx.tmp;
    expect(await fileOnDisk(fx.repo, 'README.md')).toMatchObject({ binary: false });
    rmSync(join(fx.repo, 'src', 'app.txt'));
    execFileSync('mkfifo', [join(fx.repo, 'src', 'app.txt')]);
    expect(await fileOnDisk(fx.repo, 'src/app.txt')).toBeNull();
  }, 2000);
});
