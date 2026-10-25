import { Link as RouterLink } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from '@/components/mermaid-diagram';
import { type Link, useProject } from '@/lib/api';
import { useCodeRef } from '@/lib/code-api';
import { codeRefOf, type MdNode, remarkCodeRefs } from '@/lib/code-refs';
import { ATTACHMENT_SCHEME } from '@/lib/notes/types';

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

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  position?: { start: { offset?: number } };
}

const isCheckbox = (n: HastNode) => n.tagName === 'input' && n.properties?.type === 'checkbox';

/** Tags each task checkbox with its list item's source offset, so a tick can edit the text. */
function rehypeTaskOffsets() {
  const visit = (node: HastNode): void => {
    for (const child of node.children ?? []) {
      const offset = child.position?.start.offset;
      if (child.tagName === 'li' && offset !== undefined) {
        const inner = child.children ?? [];
        const box =
          inner.find(isCheckbox) ?? inner.find((c) => c.tagName === 'p')?.children?.find(isCheckbox);
        if (box) box.properties = { ...box.properties, dataTaskOffset: offset };
      }
      visit(child);
    }
  };
  return (tree: HastNode) => visit(tree);
}

const DATA_IMAGE_RE = /^data:image\//i;

const urlTransform = (url: string, key: string) =>
  url.startsWith(WIKI_PREFIX) ||
  codeRefOf(url) !== null ||
  (key === 'src' && (DATA_IMAGE_RE.test(url) || url.startsWith(ATTACHMENT_SCHEME)))
    ? url
    : defaultUrlTransform(url);

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
  /** Without one, code refs stay plain text and memory wikilinks render as missing. */
  project?: string;
  /** Resolved `[[links]]` from memory.py; unresolved targets render as missing. */
  links?: Link[];
  /** Maps a relative href to an in-app link, or null to leave it alone. */
  renderLink?: (href: string, children: ReactNode) => ReactNode | null;
  /** Renders `[[inner text]]` in place of the memory-note lookup. */
  renderWikiLink?: (inner: string, children: ReactNode) => ReactNode;
  /** Blob URL for an `attachment:<id>` image, or undefined while it loads. */
  resolveAttachment?: (id: string) => string | undefined;
  /** Makes task checkboxes tickable; gets the source offset of the ticked list item. */
  onToggleTask?: (offset: number) => void;
}

export function Markdown(props: MarkdownProps) {
  return props.project ? <ProjectMarkdown {...props} project={props.project} /> : <MarkdownBody {...props} />;
}

function ProjectMarkdown(props: MarkdownProps & { project: string }) {
  // Code refs need the repo on disk; absolute paths count only when inside it.
  const repoRoot = useProject(props.project).data?.repo;
  return <MarkdownBody {...props} repoRoot={repoRoot ?? undefined} />;
}

function MarkdownBody({
  text,
  project,
  links = [],
  renderLink,
  renderWikiLink,
  resolveAttachment,
  onToggleTask,
  repoRoot,
}: MarkdownProps & { repoRoot?: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={
          typeof repoRoot === 'string'
            ? [remarkGfm, remarkWikiLinks, [remarkCodeRefs, { repoRoot }]]
            : [remarkGfm, remarkWikiLinks]
        }
        rehypePlugins={onToggleTask ? [rehypeTaskOffsets] : []}
        urlTransform={urlTransform}
        components={{
          ...(onToggleTask && {
            input: ({ node, type, checked }) => {
              const offset = (node?.properties as HastNode['properties'])?.dataTaskOffset;
              if (type !== 'checkbox' || typeof offset !== 'number') return <input type={type} disabled />;
              return (
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  data-task-offset={offset}
                  onChange={() => onToggleTask(offset)}
                />
              );
            },
          }),
          pre: ({ node, children }) => {
            const code = node?.children[0];
            const isMermaid =
              code?.type === 'element' &&
              code.tagName === 'code' &&
              Array.isArray(code.properties.className) &&
              code.properties.className.includes('language-mermaid');
            if (!isMermaid) return <pre>{children}</pre>;
            const source = code.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
            return <MermaidDiagram source={source} />;
          },
          // Remote images would let untrusted repos track the reader, and there's no endpoint for repo files.
          img: ({ src, alt = '' }) => {
            const url = typeof src === 'string' ? src : '';
            const blobUrl = url.startsWith(ATTACHMENT_SCHEME)
              ? resolveAttachment?.(url.slice(ATTACHMENT_SCHEME.length))
              : undefined;
            if (blobUrl) return <img src={blobUrl} alt={alt} />;
            return DATA_IMAGE_RE.test(url) ? (
              <img src={url} alt={alt} />
            ) : (
              <span className="text-muted-foreground italic" title={url}>
                {alt || url}
              </span>
            );
          },
          a: ({ href = '', children }) => {
            if (href.startsWith(WIKI_PREFIX)) {
              const target = decodeURIComponent(href.slice(WIKI_PREFIX.length));
              if (renderWikiLink) return renderWikiLink(target, children);
              const name = links.find((l) => l.target === target)?.name;
              if (!name || !project) {
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
            if (codeRef !== null && project) {
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
