import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown.tsx';

const render = (text: string) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Markdown text={text} project="example-project" />
    </QueryClientProvider>,
  );

describe('Markdown images', () => {
  it('shows alt text instead of loading a remote image', () => {
    const html = render('![tracking pixel](https://example.com/p.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('tracking pixel');
    expect(html).toContain('title="https://example.com/p.png"');
  });

  it('shows alt text for a relative image', () => {
    const html = render('![diagram](docs/flow.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('diagram');
    expect(html).toContain('title="docs/flow.png"');
  });

  it('falls back to the src when there is no alt text', () => {
    const html = render('![](img/a.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('>img/a.png<');
  });

  it('still renders an inline data image', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    expect(render(`![dot](${src})`)).toContain(`<img src="${src}" alt="dot"/>`);
  });
});
