import { indentLess, indentMore, insertNewlineAndIndent } from '@codemirror/commands';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import type { StateCommand } from '@codemirror/state';

/** Four spaces nest under `-`, `1.` and `10.` items alike, where two would not. */
export const listIndent = indentUnit.of('    ');

const EMPTY_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?$/;

/** Enter: continue the list; on an empty item, move it out a level or end the list. */
export const continueList: StateCommand = (target) => {
  const { state, dispatch } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length === 1 && range.empty) {
    const line = state.doc.lineAt(range.head);
    const empty = range.head === line.to ? EMPTY_ITEM.exec(line.text) : null;
    if (empty) {
      if (empty[1]) return indentLess(target);
      dispatch(state.update({ changes: { from: line.from, to: line.to }, userEvent: 'delete' }));
      return true;
    }
  }
  return insertNewlineContinueMarkup(target) || insertNewlineAndIndent(target);
};

export const indentList: StateCommand = indentMore;
export const outdentList: StateCommand = indentLess;
