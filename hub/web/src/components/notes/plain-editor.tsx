import { type ClipboardEvent, useEffect, useRef } from 'react';
import { ATTACHMENT_SCHEME, type EditorProps } from '@/lib/notes/types';

/** Stand-in for the CodeMirror editor, with the same props. */
export function PlainEditor({ value, onChange, onBlur, readOnly, autoFocus, onPasteImage }: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (!file || readOnly) return;
    e.preventDefault();
    const area = e.currentTarget;
    const { selectionStart: from, selectionEnd: to } = area;
    void onPasteImage(file).then((id) => {
      const ref = `![${file.name || 'image'}](${ATTACHMENT_SCHEME}${id})`;
      onChange(`${area.value.slice(0, from)}${ref}${area.value.slice(to)}`);
    });
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onPaste={onPaste}
      readOnly={readOnly}
      spellCheck
      aria-label="Note text"
      className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed outline-none"
    />
  );
}
