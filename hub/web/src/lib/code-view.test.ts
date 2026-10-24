import { describe, expect, it } from 'vitest';
import { copyPathText, effectiveView, isMarkdownPath, resolveRelative } from './code-view.ts';

describe('isMarkdownPath', () => {
  it('matches .md and .markdown, in any case', () => {
    expect(isMarkdownPath('README.md')).toBe(true);
    expect(isMarkdownPath('docs/guide.markdown')).toBe(true);
    expect(isMarkdownPath('NOTES.MD')).toBe(true);
  });

  it('rejects other files', () => {
    expect(isMarkdownPath('src/app.ts')).toBe(false);
    expect(isMarkdownPath('md')).toBe(false);
    expect(isMarkdownPath('notes.md.bak')).toBe(false);
    expect(isMarkdownPath('docs.md/index.ts')).toBe(false);
  });
});

describe('effectiveView', () => {
  it('renders markdown by default', () => {
    expect(effectiveView('README.md', undefined, undefined)).toBe('rendered');
  });

  it('shows source when asked', () => {
    expect(effectiveView('README.md', 'source', undefined)).toBe('source');
  });

  it('shows source for a line link, so the line can be highlighted', () => {
    expect(effectiveView('README.md', undefined, 12)).toBe('source');
  });

  it('always shows source for other files', () => {
    expect(effectiveView('src/app.ts', undefined, undefined)).toBe('source');
  });
});

describe('resolveRelative', () => {
  it('resolves against the file folder', () => {
    expect(resolveRelative('README.md', 'docs/guide.md')).toBe('docs/guide.md');
    expect(resolveRelative('docs/a.md', './b.md')).toBe('docs/b.md');
    expect(resolveRelative('docs/a.md', '../README.md')).toBe('README.md');
  });

  it('drops the fragment', () => {
    expect(resolveRelative('docs/a.md', 'b.md#setup')).toBe('docs/b.md');
  });

  it('returns null above the repo', () => {
    expect(resolveRelative('README.md', '../outside.md')).toBeNull();
  });
});

describe('copyPathText', () => {
  it('joins the repo root and the file path', () => {
    expect(copyPathText('/home/user/example-project', 'src/app.ts', undefined)).toBe(
      '/home/user/example-project/src/app.ts',
    );
    expect(copyPathText('/home/user/example-project/', 'README.md', undefined)).toBe(
      '/home/user/example-project/README.md',
    );
  });

  it('adds the selected line', () => {
    expect(copyPathText('/home/user/example-project', 'src/app.ts', 42)).toBe(
      '/home/user/example-project/src/app.ts:42',
    );
  });
});
