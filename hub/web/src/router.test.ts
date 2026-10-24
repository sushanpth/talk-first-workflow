import { describe, expect, it } from 'vitest';
import { router } from '@/router';
import { DocPage, DocsPage } from '@/routes/docs';

const leaf = (path: string) => {
  const match = router.matchRoutes(path, {}).at(-1);
  const route = match ? router.routesById[match.routeId] : undefined;
  return { component: route?.options.component, params: match?.params };
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
