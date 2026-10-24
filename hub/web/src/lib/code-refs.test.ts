import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { chunk, codeRefOf, remarkCodeRefs } from './code-refs.ts';

const REPO = '/home/user/example-project';

/** Renders markdown with the plugin; candidates come out as `<a data-ref="...">`. */
function render(text: string, repoRoot: string | null = REPO): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, [remarkCodeRefs, { repoRoot }]],
      urlTransform: (url: string) => url,
      components: {
        a: ({ href = '', children }: { href?: string; children?: ReactNode }) => {
          const ref = codeRefOf(href);
          return ref === null
            ? createElement('a', { href }, children)
            : createElement('a', { 'data-ref': ref }, children);
        },
      },
      children: text,
    }),
  );
}

const candidates = (text: string, repoRoot?: string | null) =>
  [...render(text, repoRoot).matchAll(/data-ref="([^"]*)"/g)].map((m) => m[1]);

describe('remarkCodeRefs', () => {
  it('takes inline code that reads as a path', () => {
    expect(candidates('See `hub/server/app.ts:42` and `README.md`.')).toEqual([
      'hub/server/app.ts:42',
      'README.md',
    ]);
  });

  it('wraps the inline code itself, so the link shows as code', () => {
    expect(render('`hub/cli.ts`')).toContain('<a data-ref="hub/cli.ts"><code>hub/cli.ts</code></a>');
  });

  it('skips inline code that is not a path', () => {
    expect(candidates('Run `pnpm build`, `src/*.ts`, `https://example.com/a.ts` or `~/x.md`.')).toEqual([]);
  });

  it('takes absolute paths only inside the repo root', () => {
    expect(candidates(`\`${REPO}/hub/cli.ts:3\` and \`/etc/hosts\``)).toEqual([`${REPO}/hub/cli.ts:3`]);
    expect(candidates(`\`${REPO}/hub/cli.ts\``, null)).toEqual([]);
  });

  it('ignores fenced code blocks and existing links', () => {
    expect(candidates('```\nhub/cli.ts\n```\n\n[`hub/cli.ts`](https://example.com)')).toEqual([]);
  });

  it('takes path-like words from a **Where:** line, without surrounding punctuation', () => {
    const html = render('**Where:** merged in abc1234 (hub/server/agents.ts) · docs/setup.md:12, done');
    expect([...html.matchAll(/data-ref="([^"]*)"/g)].map((m) => m[1])).toEqual([
      'hub/server/agents.ts',
      'docs/setup.md:12',
    ]);
    expect(html).toContain('(<a data-ref="hub/server/agents.ts">hub/server/agents.ts</a>)');
    expect(html).toContain('<a data-ref="docs/setup.md:12">docs/setup.md:12</a>, done');
  });

  it('works on a Where line inside a list item', () => {
    expect(candidates('- **Where:** hub/cli.ts')).toEqual(['hub/cli.ts']);
  });

  it('stops at the end of the Where line', () => {
    const text = '**Why:** see hub/a.ts\n**Where:** hub/b.ts\nlater hub/c.ts';
    expect(candidates(text)).toEqual(['hub/b.ts']);
  });

  it('leaves plain text outside code spans and Where lines alone', () => {
    expect(candidates('The file hub/server/app.ts:42 is mentioned in prose.')).toEqual([]);
  });

  it('still takes inline code on a Where line', () => {
    expect(candidates('**Where:** `hub/cli.ts` and hub/web/src/main.tsx')).toEqual([
      'hub/cli.ts',
      'hub/web/src/main.tsx',
    ]);
  });
});

describe('codeRefOf', () => {
  it('reads only code-ref urls', () => {
    expect(codeRefOf('https://example.com')).toBeNull();
    expect(codeRefOf('coderef:a%2Fb.ts%3A3')).toBe('a/b.ts:3');
  });

  it('answers null for a malformed escape instead of throwing', () => {
    expect(codeRefOf('coderef:%E0')).toBeNull();
  });
});

describe('chunk', () => {
  it('splits into batches of at most the given size', () => {
    const refs = Array.from({ length: 205 }, (_, i) => `f${i}.ts`);
    expect(chunk(refs, 100).map((c) => c.length)).toEqual([100, 100, 5]);
    expect(chunk([], 100)).toEqual([]);
  });
});
