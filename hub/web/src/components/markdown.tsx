import { Link as RouterLink } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Link, useProject } from '@/lib/api';
import { useCodeRef } from '@/lib/code-api';
import { codeRefOf, type MdNode, remarkCodeRefs } from '@/lib/code-refs';

const WIKI_RE = /\[\[([^\]]+)\]\]/g;
const WIKI_PREFIX = 'wikilink:';

function splitWikiLinks(value: string): MdNode[] {
  const nodes: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(WIKI_RE)) {
    const target = match[1] ?? '';
    if (match.index > last) nodes.push({ type: 'text', value: value.slice(last, match.index) });
    nodes.push({
      type: 'link',
      url: WIKI_PREFIX + encodeURIComponent(target),
      children: [{ type: 'text', value: target }],
    });
    last = match.index + match[0].length;
  }
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}

/** Turns `[[name]]` in text (not code, not existing links) into wikilink nodes. */
function remarkWikiLinks() {
  const visit = (node: MdNode): void => {
    if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text') return splitWikiLinks(child.value ?? '');
      visit(child);
      return [child];
    });
  };
  return (tree: MdNode) => visit(tree);
}

const urlTransform = (url: string) =>
  url.startsWith(WIKI_PREFIX) || codeRefOf(url) !== null ? url : defaultUrlTransform(url);

/** Links a code-ref candidate into the code viewer once the hub confirms it's a tracked file. */
function CodeRefLink({
  project,
  codeRef,
  children,
}: {
  project: string;
  codeRef: string;
  children: ReactNode;
}) {
  const resolved = useCodeRef(project, codeRef).data;
  if (!resolved) return <>{children}</>;
  return (
    <RouterLink
      to="/p/$project/code/$"
      params={{ project, _splat: resolved.path }}
      search={resolved.line ? { line: resolved.line } : {}}
      data-coderef={codeRef}
    >
      {children}
    </RouterLink>
  );
}

interface MarkdownProps {
  text: string;
  project: string;
  /** Resolved `[[links]]` from memory.py; unresolved targets render as missing. */
  links?: Link[];
  /** Maps a relative href to an in-app link, or null to leave it alone. */
  renderLink?: (href: string, children: ReactNode) => ReactNode | null;
  /** Replaces images with a relative src, or null to leave one alone. */
  renderImage?: (src: string, alt: string) => ReactNode | null;
}

const isExternal = (url: string) => /^[a-z]+:/i.test(url) || url.startsWith('//');

export function Markdown({ text, project, links = [], renderLink, renderImage }: MarkdownProps) {
  // Code refs need the repo on disk; absolute paths count only when inside it.
  const repoRoot = useProject(project).data?.repo;
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={
          typeof repoRoot === 'string'
            ? [remarkGfm, remarkWikiLinks, [remarkCodeRefs, { repoRoot }]]
            : [remarkGfm, remarkWikiLinks]
        }
        urlTransform={urlTransform}
        components={{
          ...(renderImage && {
            img: ({ node: _node, ...props }) => {
              const { src, alt = '' } = props;
              const replaced =
                typeof src === 'string' && src && !isExternal(src) ? renderImage(src, alt) : null;
              return replaced ?? <img {...props} alt={alt} />;
            },
          }),
          a: ({ href = '', children }) => {
            if (href.startsWith(WIKI_PREFIX)) {
              const target = decodeURIComponent(href.slice(WIKI_PREFIX.length));
              const name = links.find((l) => l.target === target)?.name;
              if (!name) {
                return (
                  <span className="text-muted-foreground line-through" title="No note with this name">
                    [[{children}]]
                  </span>
                );
              }
              return (
                <RouterLink
                  to="/p/$project/memory/$note"
                  params={{ project, note: name }}
                  data-wikilink={target}
                >
                  {children}
                </RouterLink>
              );
            }
            const codeRef = codeRefOf(href);
            if (codeRef !== null) {
              return (
                <CodeRefLink project={project} codeRef={codeRef}>
                  {children}
                </CodeRefLink>
              );
            }
            if (/^[a-z]+:/i.test(href) || href.startsWith('#')) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            return renderLink?.(href, children) ?? <a href={href}>{children}</a>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
