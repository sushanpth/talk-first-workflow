import { parseCodeRef } from '../../../server/code-types.ts';

/** The slice of mdast this plugin reads and writes. */
export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const PREFIX = 'coderef:';
const WHERE_LABEL = 'Where:';
// Same edges parseCodeRef trims, kept outside the link so `(a.ts)` links only `a.ts`.
const LEADING = /^[(['"]+/;
const TRAILING = /[.,;!?)\]}'"]+$/;

/** The candidate ref inside a `coderef:` url, or null for any other or malformed url. */
export function codeRefOf(url: string): string | null {
  if (!url.startsWith(PREFIX)) return null;
  try {
    return decodeURIComponent(url.slice(PREFIX.length));
  } catch {
    return null;
  }
}

const refLink = (ref: string, child: MdNode): MdNode => ({
  type: 'link',
  url: PREFIX + encodeURIComponent(ref),
  children: [child],
});

const textOf = (node: MdNode): string => node.value ?? (node.children ?? []).map(textOf).join('');

/** Splits a Where line's text into text and candidate links; prose words without `/` or `.` are skipped. */
function linkWords(value: string, repoRoot: string | undefined): MdNode[] {
  const out: MdNode[] = [];
  let pending = '';
  for (const piece of value.split(/(\s+)/)) {
    const lead = LEADING.exec(piece)?.[0] ?? '';
    const rest = piece.slice(lead.length);
    const trail = TRAILING.exec(rest)?.[0] ?? '';
    const core = rest.slice(0, rest.length - trail.length);
    const ref = core ? parseCodeRef(core, repoRoot) : null;
    if (!ref || !/[/.]/.test(ref.path)) {
      pending += piece;
      continue;
    }
    pending += lead;
    if (pending) out.push({ type: 'text', value: pending });
    out.push(refLink(core, { type: 'text', value: core }));
    pending = trail;
  }
  if (pending) out.push({ type: 'text', value: pending });
  return out;
}

/** Links words in the text that follows a `**Where:**` label, up to the end of that line. */
function linkWhereLines(children: MdNode[], repoRoot: string | undefined): MdNode[] {
  let inWhere = false;
  return children.flatMap((child) => {
    if (child.type === 'strong') {
      inWhere = textOf(child).trim() === WHERE_LABEL;
      return [child];
    }
    if (child.type === 'break') inWhere = false;
    if (!inWhere || child.type !== 'text') return [child];
    const value = child.value ?? '';
    const end = value.indexOf('\n');
    if (end === -1) return linkWords(value, repoRoot);
    inWhere = false;
    return [...linkWords(value.slice(0, end), repoRoot), { type: 'text', value: value.slice(end) }];
  });
}

function visit(node: MdNode, repoRoot: string | undefined): void {
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
  const children = node.type === 'paragraph' ? linkWhereLines(node.children, repoRoot) : node.children;
  node.children = children.map((child) => {
    if (child.type === 'inlineCode') {
      const ref = (child.value ?? '').trim();
      return parseCodeRef(ref, repoRoot) ? refLink(ref, child) : child;
    }
    visit(child, repoRoot);
    return child;
  });
}

/**
 * Remark plugin: wraps code-ref candidates in `coderef:` links, taken only from inline code and
 * `**Where:**` lines since prose gives too many false hits. The resolve route decides which are real.
 */
export function remarkCodeRefs({ repoRoot }: { repoRoot?: string | null } = {}) {
  return (tree: MdNode) => visit(tree, repoRoot ?? undefined);
}
