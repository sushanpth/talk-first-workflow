import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState, type Extension, type Transaction } from '@codemirror/state';
import { listIndent } from './lists.ts';

/** A state from a doc where `|` marks the cursor. */
export function stateOf(doc: string, extensions: Extension[] = []): EditorState {
  const at = doc.indexOf('|');
  return EditorState.create({
    doc: doc.replace('|', ''),
    selection: EditorSelection.cursor(Math.max(at, 0)),
    extensions: [markdown({ base: markdownLanguage }), listIndent, ...extensions],
  });
}

/** The doc with `|` at the cursor. */
export function show(state: EditorState): string {
  const head = state.selection.main.head;
  return `${state.doc.sliceString(0, head)}|${state.doc.sliceString(head)}`;
}

/** A command target whose state follows its own dispatches, like an EditorView. */
export function target(state: EditorState) {
  const t = {
    state,
    dispatch(tr: Transaction) {
      t.state = tr.state;
    },
  };
  return t;
}
