import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { languageFor, monaco, useMonacoTheme } from '@/lib/monaco';

type CodeEditor = monaco.editor.IStandaloneCodeEditor;

function showLine(editor: CodeEditor, marks: monaco.editor.IEditorDecorationsCollection, line?: number) {
  const count = editor.getModel()?.getLineCount() ?? 0;
  if (!line || count === 0) {
    marks.clear();
    return;
  }
  const target = Math.min(line, count);
  marks.set([
    {
      range: new monaco.Range(target, 1, target, 1),
      options: {
        isWholeLine: true,
        // Monaco strips class names to [a-z0-9_-], so no Tailwind modifiers; this one follows the theme.
        className: 'rangeHighlight',
        linesDecorationsClassName: 'bg-amber-500',
      },
    },
  ]);
  editor.setPosition({ lineNumber: target, column: 1 });
  editor.revealLineInCenter(target);
}

interface CodeViewerProps {
  path: string;
  content: string;
  line?: number;
  onLineClick: (line: number) => void;
}

/** Read-only Monaco view of one file; remount per path (key) so scroll and marks start fresh. */
export default function CodeViewer({ path, content, line, onLineClick }: CodeViewerProps) {
  const theme = useMonacoTheme();
  const editor = useRef<{ editor: CodeEditor; marks: monaco.editor.IEditorDecorationsCollection } | null>(
    null,
  );
  // The mouse handler is bound once at mount, so it reads the latest callback and line from refs.
  const latest = useRef({ onLineClick, line });
  latest.current = { onLineClick, line };

  useEffect(() => {
    if (editor.current) showLine(editor.current.editor, editor.current.marks, line);
  }, [line]);

  const onMount: OnMount = (instance) => {
    const marks = instance.createDecorationsCollection();
    editor.current = { editor: instance, marks };
    showLine(instance, marks, latest.current.line);
    instance.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber;
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS && lineNumber) {
        latest.current.onLineClick(lineNumber);
      }
    });
  };

  return (
    <Editor
      height="100%"
      value={content}
      language={languageFor(path)}
      theme={theme}
      onMount={onMount}
      options={{
        readOnly: true,
        domReadOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
      }}
    />
  );
}
