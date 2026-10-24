import { describe, expect, it } from 'vitest';
import { router } from '@/router';
import { parseCodeFileSearch } from '@/routes/code';
import { DocPage, DocsPage } from '@/routes/docs';
import { sectionOf } from '@/routes/projects';

const leaf = (path: string) => {
  const match = router.matchRoutes(path, {}).at(-1);
  const route = match ? router.routesById[match.routeId] : undefined;
  return { component: route?.options.component, params: match?.params, routeId: match?.routeId ?? '' };
};

describe('docs routes', () => {
  it('opens the docs list at /docs, not an empty doc', () => {
    expect(leaf('/p/x/docs').component).toBe(DocsPage);
    expect(leaf('/p/x/docs/').component).toBe(DocsPage);
  });

  it('opens a doc under /docs/', () => {
    expect(leaf('/p/x/docs/README.md').component).toBe(DocPage);
    expect(leaf('/p/x/docs/docs/guide.md').params).toMatchObject({ _splat: 'docs/guide.md' });
  });
});

describe('sectionOf', () => {
  it('finds the section of every page under a project', () => {
    const cases: [string, string][] = [
      ['/p/x/plans', 'Plans'],
      ['/p/x/plans/brief.md', 'Plans'],
      ['/p/x/memory/note', 'Memory'],
      ['/p/x/docs', 'Docs'],
      ['/p/x/docs/guide/intro.md', 'Docs'],
      ['/p/x/code', 'Code'],
      ['/p/x/code/search', 'Code'],
      ['/p/x/code/src/app.ts', 'Code'],
      ['/p/x/worktrees/agent-1', 'Worktrees'],
    ];
    for (const [path, label] of cases) expect(sectionOf(leaf(path).routeId).label, path).toBe(label);
  });

  it('falls back to plans outside a section', () => {
    expect(sectionOf(leaf('/').routeId).label).toBe('Plans');
  });
});

describe('parseCodeFileSearch', () => {
  it('keeps only view=source and positive lines', () => {
    expect(parseCodeFileSearch({ view: 'source', line: '7' })).toEqual({ view: 'source', line: 7 });
    expect(parseCodeFileSearch({ view: 'rendered', line: '0' })).toEqual({
      view: undefined,
      line: undefined,
    });
  });
});
