import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { refreshPreview } from '@/lib/notes/cm/preview';
import { noteExtensions } from '@/lib/notes/cm/setup';
import { noteTheme } from '@/lib/notes/cm/theme';
import type { EditorProps } from '@/lib/notes/types';

// Marks doc replacements from the `value` prop, which must not echo back through onChange.
const external = Annotation.define<boolean>();

// A saved echo of an older keystroke can arrive after newer ones; it must not roll the doc back.
const ECHO_LIMIT = 50;

const readOnlyState = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
];

/** CodeMirror live-preview markdown editor for one note; remount with `key={note.id}` to switch notes. */
export default function NoteEditor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Extensions are built once; they read the latest props from here.
  const latest = useRef(props);
  latest.current = props;
  const compartments = useRef({ theme: new Compartment(), readOnly: new Compartment() });
  const emitted = useRef<string[]>([]);

  useEffect(() => {
    if (!host.current) return;
    const { theme, readOnly } = compartments.current;
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          noteExtensions(() => latest.current),
          theme.of(noteTheme(latest.current.dark)),
          readOnly.of(readOnlyState(Boolean(latest.current.readOnly))),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) {
              const value = update.state.doc.toString();
              emitted.current = [...emitted.current.slice(1 - ECHO_LIMIT), value];
              latest.current.onChange(value);
            }
            if (update.focusChanged && !update.view.hasFocus) latest.current.onBlur?.();
          }),
        ],
      }),
    });
    view.current = instance;
    if (latest.current.autoFocus) instance.focus();
    return () => {
      view.current = null;
      instance.destroy();
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() === props.value) {
      emitted.current = [];
      return;
    }
    if (emitted.current.includes(props.value)) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: props.value },
      annotations: [external.of(true)],
    });
  }, [props.value]);

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.current.theme.reconfigure(noteTheme(props.dark)) });
  }, [props.dark]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.readOnly.reconfigure(readOnlyState(Boolean(props.readOnly))),
    });
  }, [props.readOnly]);

  // A new resolver usually means an attachment's blob URL just loaded.
  useEffect(() => {
    view.current?.dispatch({ effects: refreshPreview.of(null) });
  }, [props.resolveAttachment]);

  return <div ref={host} className="h-full min-h-0" />;
}
