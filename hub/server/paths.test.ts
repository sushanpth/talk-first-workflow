import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isInside, realInside } from './paths.ts';

describe('isInside', () => {
  it('accepts the root and paths below it', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/c/d.md')).toBe(true);
  });

  it('rejects parents, siblings and look-alike prefixes', () => {
    expect(isInside('/a/b', '/a')).toBe(false);
    expect(isInside('/a/b', '/a/bc/file')).toBe(false);
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
    expect(isInside('/a/b', '/etc/passwd')).toBe(false);
  });

  it('allows names that merely start with two dots', () => {
    expect(isInside('/a/b', '/a/b/..hidden')).toBe(true);
  });
});

describe('realInside', () => {
  let tmp = '';
  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'hub-paths-')));
    mkdirSync(join(tmp, 'root'));
    writeFileSync(join(tmp, 'root', 'ok.md'), 'ok');
    writeFileSync(join(tmp, 'secret.txt'), 'secret');
    symlinkSync(join(tmp, 'secret.txt'), join(tmp, 'root', 'link.md'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns the real path of a file inside a root', async () => {
    expect(await realInside([join(tmp, 'root')], join(tmp, 'root', 'ok.md'))).toBe(
      join(tmp, 'root', 'ok.md'),
    );
  });

  it('blocks .. traversal, symlink escapes and missing files', async () => {
    const roots = [join(tmp, 'root')];
    expect(await realInside(roots, join(tmp, 'root', '..', 'secret.txt'))).toBeNull();
    expect(await realInside(roots, join(tmp, 'root', 'link.md'))).toBeNull();
    expect(await realInside(roots, join(tmp, 'root', 'missing.md'))).toBeNull();
  });
});
