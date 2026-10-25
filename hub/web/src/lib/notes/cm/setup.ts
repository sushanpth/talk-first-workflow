import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { deleteMarkupBackward, markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, keymap } from '@codemirror/view';
import type { EditorProps } from '../types.ts';
import { tagCompletion, wikiLinkCompletion } from './completion.ts';
import { imagePaste, imagesOf, insertImages } from './images.ts';
import { continueList, indentList, listIndent, outdentList } from './lists.ts';
import { livePreview } from './preview.ts';
import { wikiLinkAt } from './syntax.ts';

export type NoteEditorHooks = Pick<
  EditorProps,
  'linkTargets' | 'tags' | 'onOpenLink' | 'onPasteImage' | 'resolveAttachment'
>;

/** Everything but theme, read-only and change listeners. `hooks` is read on use, so props can change. */
export function noteExtensions(hooks: () => NoteEditorHooks): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorView.lineWrapping,
    listIndent,
    markdown({ base: markdownLanguage, addKeymap: false }),
    livePreview(() => hooks().resolveAttachment),
    imagePaste,
    autocompletion({
      icons: false,
      override: [wikiLinkCompletion(() => hooks().linkTargets()), tagCompletion(() => hooks().tags())],
    }),
    keymap.of([
      { key: 'Enter', run: continueList },
      { key: 'Backspace', run: deleteMarkupBackward },
      { key: 'Tab', run: indentList, shift: outdentList },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const link = pos === null ? undefined : wikiLinkAt(view.state, pos);
        if (!link) return false;
        event.preventDefault();
        hooks().onOpenLink(link);
        return true;
      },
      paste(event, view) {
        const files = imagesOf(event.clipboardData?.files ?? []);
        if (!files.length || view.state.readOnly) return false;
        event.preventDefault();
        void insertImages(view, files, hooks().onPasteImage);
        return true;
      },
      drop(event, view) {
        const files = imagesOf(event.dataTransfer?.files ?? []);
        if (!files.length || view.state.readOnly) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
        void insertImages(view, files, hooks().onPasteImage, pos);
        return true;
      },
    }),
  ];
}
