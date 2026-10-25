import type { EditorState, TransactionSpec } from '@codemirror/state';

const TASK = /^(\s*(?:>\s?)*\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/;

/** Ticks or unticks the checkbox of the list item on `pos`'s line; null if it has none. */
export function toggleTask(state: EditorState, pos: number): TransactionSpec | null {
  const line = state.doc.lineAt(pos);
  const match = TASK.exec(line.text);
  if (!match?.[1] || !match[2]) return null;
  const at = line.from + match[1].length;
  return {
    changes: { from: at, to: at + 1, insert: match[2] === ' ' ? 'x' : ' ' },
    userEvent: 'input.toggle',
  };
}
