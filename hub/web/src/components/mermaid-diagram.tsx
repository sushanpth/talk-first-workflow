import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { ViewChip } from '@/components/view-chip';

type Mermaid = typeof import('mermaid').default;

// A dynamic import keeps mermaid in its own chunk, fetched only by pages with a diagram.
let mermaidModule: Promise<Mermaid> | undefined;
const loadMermaid = () => {
  mermaidModule ??= import('mermaid').then(
    (m) => m.default,
    (err: unknown) => {
      mermaidModule = undefined;
      throw err;
    },
  );
  return mermaidModule;
};

const DARK_QUERY = '(prefers-color-scheme: dark)';
const subscribeTheme = (notify: () => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const isDark = () => window.matchMedia(DARK_QUERY).matches;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Result = { svg: string } | { error: string };

export function MermaidDiagram({ source }: { source: string }) {
  // mermaid uses the id as an element id and CSS selector, so keep it to safe characters.
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`;
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  const [result, setResult] = useState<Result | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let current = true;
    loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          // Throw on bad syntax instead of leaving mermaid's error graphic in the page.
          suppressErrorRendering: true,
          theme: dark ? 'dark' : 'default',
        });
        return mermaid.render(id, source);
      })
      .then(
        ({ svg }) => {
          if (current) setResult({ svg });
        },
        (err: unknown) => {
          if (current) setResult({ error: errorText(err) });
        },
      );
    return () => {
      current = false;
    };
  }, [id, source, dark]);

  const code = (
    <pre className="m-0 overflow-auto rounded-md bg-muted p-3 text-sm">
      <code>{source}</code>
    </pre>
  );

  if (result && 'error' in result) {
    const message = result.error.trim();
    return (
      <div data-mermaid="error" className="not-prose my-4 space-y-2">
        {code}
        <p className="truncate text-sm text-destructive" title={message}>
          Diagram error: {message.split('\n')[0]}
        </p>
      </div>
    );
  }

  let body = code;
  if (!showSource) {
    body = result ? (
      <div
        className="flex justify-center overflow-auto"
        // Safe to insert: securityLevel 'strict' has mermaid sanitize the SVG with DOMPurify, without scripts or click handlers.
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
    ) : (
      <p className="text-sm text-muted-foreground">Loading diagram...</p>
    );
  }
  return (
    <div data-mermaid={result ? 'ok' : 'loading'} className="not-prose my-4 rounded-md border p-3">
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would add a border and legend we don't want here. */}
      <div role="group" aria-label="Diagram view" className="mb-2 flex justify-end gap-1">
        <ViewChip label="Diagram" active={!showSource} onClick={() => setShowSource(false)} />
        <ViewChip label="Source" active={showSource} onClick={() => setShowSource(true)} />
      </div>
      {body}
    </div>
  );
}
