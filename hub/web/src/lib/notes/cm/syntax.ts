import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { NoteLink } from '../types.ts';

const WIKILINK = /\[\[([^[\]\n|#]*)(?:#([^[\]\n|]*))?(?:\|([^[\]\n]*))?\]\]/g;
// Same shape as Obsidian tags: must start with a letter or underscore, so `#1` and `# heading` are not tags.
export const TAG = /(?<=^|[\s(])#[\p{L}_][\p{L}\p{N}_/-]*/gu;

/** `[[target#heading|alias]]` links in `text`, with offsets shifted by `offset`. */
export function findWikiLinks(text: string, offset = 0): NoteLink[] {
  const links: NoteLink[] = [];
  for (const m of text.matchAll(WIKILINK)) {
    const target = m[1]?.trim() ?? '';
    if (!target) continue;
    const link: NoteLink = { target, from: offset + m.index, to: offset + m.index + m[0].length };
    const heading = m[2]?.trim();
    const alias = m[3]?.trim();
    if (heading) link.heading = heading;
    if (alias) link.alias = alias;
    links.push(link);
  }
  return links;
}

const CODE = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText']);

/** True inside inline code or a code block, where links and tags are plain text. */
export function inCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1);
  for (;;) {
    if (CODE.has(node.name)) return true;
    if (!node.parent) return false;
    node = node.parent;
  }
}

/** The `[[link]]` covering `pos`, outside code. */
export function wikiLinkAt(state: EditorState, pos: number): NoteLink | undefined {
  const line = state.doc.lineAt(pos);
  const link = findWikiLinks(line.text, line.from).find((l) => l.from <= pos && pos <= l.to);
  return link && !inCode(state, link.from) ? link : undefined;
}
