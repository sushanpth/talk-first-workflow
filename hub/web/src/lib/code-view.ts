export type CodeView = 'rendered' | 'source';

export const isMarkdownPath = (path: string): boolean => /\.(md|markdown)$/i.test(path);

/** Markdown opens rendered unless source is asked for; a line link needs Monaco to highlight the line. */
export function effectiveView(path: string, view: 'source' | undefined, line: number | undefined): CodeView {
  return isMarkdownPath(path) && view !== 'source' && line === undefined ? 'rendered' : 'source';
}

/** Resolves a relative link against the file's folder, e.g. ("docs/a.md", "../README.md") -> "README.md"; null above the repo. */
export function resolveRelative(from: string, href: string): string | null {
  const parts = from.split('/').slice(0, -1);
  for (const piece of href.split('#')[0]?.split('/') ?? []) {
    if (piece === '..') {
      if (parts.pop() === undefined) return null;
    } else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}
