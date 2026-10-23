import { Link as RouterLink } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Link } from '@/lib/api';

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

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

const urlTransform = (url: string) => (url.startsWith(WIKI_PREFIX) ? url : defaultUrlTransform(url));

interface MarkdownProps {
  text: string;
  project: string;
  /** Resolved `[[links]]` from memory.py; unresolved targets render as missing. */
  links?: Link[];
  /** Maps a relative href to an in-app link, or null to leave it alone. */
  renderLink?: (href: string, children: ReactNode) => ReactNode | null;
}

export function Markdown({ text, project, links = [], renderLink }: MarkdownProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        urlTransform={urlTransform}
        components={{
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
