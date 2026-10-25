import type { EditorState, TransactionSpec } from '@codemirror/state';
import { taskMarkAt } from '../model.ts';

/** Ticks or unticks the checkbox of the list item on `pos`'s line; null if it has none. */
export function toggleTask(state: EditorState, pos: number): TransactionSpec | null {
  const line = state.doc.lineAt(pos);
  const at = taskMarkAt(line.text, 0);
  if (at === undefined) return null;
  return {
    changes: { from: line.from + at, to: line.from + at + 1, insert: line.text[at] === ' ' ? 'x' : ' ' },
    userEvent: 'input.toggle',
  };
}
