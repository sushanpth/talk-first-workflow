import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { findWikiLinks } from '../model.ts';
import type { NoteLink } from '../types.ts';

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
