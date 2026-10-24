import { describe, expect, it } from 'vitest';
import {
  CODE_RESOLVE_MAX_REFS,
  codeFileQuerySchema,
  codeFilesQuerySchema,
  codeResolveQuerySchema,
  codeSearchQuerySchema,
  codeTreeQuerySchema,
  parseCodeRef,
} from './code-types.ts';
import { LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX } from './types.ts';

const ROOT = '/home/user/example-project';

describe('parseCodeRef', () => {
  it('reads a repo-relative path with and without a line', () => {
    expect(parseCodeRef('hub/server/app.ts:42')).toEqual({ path: 'hub/server/app.ts', line: 42 });
    expect(parseCodeRef('hub/server/app.ts')).toEqual({ path: 'hub/server/app.ts', line: null });
    expect(parseCodeRef('README.md')).toEqual({ path: 'README.md', line: null });
  });

  it('takes the first line of a range, a line:column pair or a GitHub anchor', () => {
    expect(parseCodeRef('src/x.ts:10-20')).toEqual({ path: 'src/x.ts', line: 10 });
    expect(parseCodeRef('src/x.ts:10:7')).toEqual({ path: 'src/x.ts', line: 10 });
    expect(parseCodeRef('src/x.ts#L12')).toEqual({ path: 'src/x.ts', line: 12 });
  });

  it('treats line 0 as no line', () => {
    expect(parseCodeRef('src/x.ts:0')).toEqual({ path: 'src/x.ts', line: null });
  });

  it('normalizes ./, doubled slashes and inner .. segments', () => {
    expect(parseCodeRef('./src/x.ts')).toEqual({ path: 'src/x.ts', line: null });
    expect(parseCodeRef('src//lib/./x.ts:3')).toEqual({ path: 'src/lib/x.ts', line: 3 });
    expect(parseCodeRef('src/lib/../x.ts')).toEqual({ path: 'src/x.ts', line: null });
  });

  it('drops surrounding whitespace and trailing punctuation from prose', () => {
    expect(parseCodeRef('  src/x.ts:5  ')).toEqual({ path: 'src/x.ts', line: 5 });
    expect(parseCodeRef('src/x.ts:5).')).toEqual({ path: 'src/x.ts', line: 5 });
    expect(parseCodeRef('src/x.ts,')).toEqual({ path: 'src/x.ts', line: null });
    expect(parseCodeRef('(src/x.ts:9)')).toEqual({ path: 'src/x.ts', line: 9 });
  });

  it('makes an absolute path inside the repo root relative', () => {
    expect(parseCodeRef(`${ROOT}/hub/server/app.ts:42`, ROOT)).toEqual({
      path: 'hub/server/app.ts',
      line: 42,
    });
    expect(parseCodeRef(`${ROOT}/src/x.ts`, `${ROOT}/`)).toEqual({ path: 'src/x.ts', line: null });
  });

  it('rejects absolute paths outside the root, or with no root given', () => {
    expect(parseCodeRef('/home/user/other-project/src/x.ts', ROOT)).toBeNull();
    expect(parseCodeRef(`${ROOT}-fork/src/x.ts`, ROOT)).toBeNull();
    expect(parseCodeRef(`${ROOT}/../other/x.ts`, ROOT)).toBeNull();
    expect(parseCodeRef(ROOT, ROOT)).toBeNull();
    expect(parseCodeRef('/etc/hosts')).toBeNull();
    expect(parseCodeRef('~/notes/x.md')).toBeNull();
  });

  it('rejects paths that climb out of the repo', () => {
    expect(parseCodeRef('../x.ts')).toBeNull();
    expect(parseCodeRef('src/../../x.ts')).toBeNull();
  });

  it('rejects text that is not a single file path', () => {
    for (const text of [
      '',
      '   ',
      '.',
      './',
      'src/',
      'pnpm run build',
      'https://example.com/x.ts',
      'hub/**/*.ts',
      'src\\x.ts',
      'a:b/x.ts',
      'x.ts:',
      '$HOME/x.ts',
    ]) {
      expect(parseCodeRef(text), text).toBeNull();
    }
  });
});

describe('code query schemas', () => {
  it('tree defaults to the root and rejects escaping paths', () => {
    expect(codeTreeQuerySchema.parse({})).toEqual({ path: '' });
    expect(codeTreeQuerySchema.parse({ path: 'hub/server' })).toEqual({ path: 'hub/server' });
    expect(codeTreeQuerySchema.safeParse({ path: '../x' }).success).toBe(false);
    expect(codeTreeQuerySchema.safeParse({ path: '/etc' }).success).toBe(false);
  });

  it('file requires a repo-relative path', () => {
    expect(codeFileQuerySchema.parse({ path: 'src/x.ts' })).toEqual({ path: 'src/x.ts' });
    expect(codeFileQuerySchema.safeParse({}).success).toBe(false);
    expect(codeFileQuerySchema.safeParse({ path: '' }).success).toBe(false);
    expect(codeFileQuerySchema.safeParse({ path: 'src/../../x' }).success).toBe(false);
    expect(codeFileQuerySchema.safeParse({ path: 'x\0y' }).success).toBe(false);
  });

  it('file list pages like the other lists', () => {
    expect(codeFilesQuerySchema.parse({})).toEqual({ q: '', limit: LIST_LIMIT_DEFAULT, offset: 0 });
    expect(codeFilesQuerySchema.parse({ q: ' app ', limit: '10', offset: '20' })).toEqual({
      q: 'app',
      limit: 10,
      offset: 20,
    });
    expect(codeFilesQuerySchema.safeParse({ limit: String(LIST_LIMIT_MAX + 1) }).success).toBe(false);
  });

  it('search needs a 1 to 200 character query and is case-insensitive by default', () => {
    expect(codeSearchQuerySchema.parse({ q: 'needle' })).toEqual({
      q: 'needle',
      case: false,
      limit: LIST_LIMIT_DEFAULT,
      offset: 0,
    });
    expect(codeSearchQuerySchema.parse({ q: ' two words ', case: 'true' })).toMatchObject({
      q: ' two words ',
      case: true,
    });
    expect(codeSearchQuerySchema.parse({ q: 'x', case: '0' }).case).toBe(false);
    expect(codeSearchQuerySchema.safeParse({}).success).toBe(false);
    expect(codeSearchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(codeSearchQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
    expect(codeSearchQuerySchema.safeParse({ q: 'x', case: 'maybe' }).success).toBe(false);
  });

  it('resolve accepts comma-separated and repeated refs', () => {
    expect(codeResolveQuerySchema.parse({ refs: 'a.ts:1, b.ts,,' })).toEqual({ refs: ['a.ts:1', 'b.ts'] });
    expect(codeResolveQuerySchema.parse({ refs: ['a.ts', 'b.ts,c.ts', 'a.ts'] })).toEqual({
      refs: ['a.ts', 'b.ts', 'c.ts'],
    });
    expect(codeResolveQuerySchema.safeParse({}).success).toBe(false);
    expect(codeResolveQuerySchema.safeParse({ refs: ' , ' }).success).toBe(false);
  });

  it('resolve caps the number of refs', () => {
    const refs = (n: number) => Array.from({ length: n }, (_, i) => `f${i}.ts`).join(',');
    expect(codeResolveQuerySchema.parse({ refs: refs(CODE_RESOLVE_MAX_REFS) }).refs).toHaveLength(
      CODE_RESOLVE_MAX_REFS,
    );
    expect(codeResolveQuerySchema.safeParse({ refs: refs(CODE_RESOLVE_MAX_REFS + 1) }).success).toBe(false);
  });
});
