import { DiffEditor } from '@monaco-editor/react';
import { languageFor, useMonacoTheme } from '@/lib/monaco';

interface DiffViewProps {
  path: string;
  original: string;
  modified: string;
  sideBySide: boolean;
}

export default function DiffView({ path, original, modified, sideBySide }: DiffViewProps) {
  const theme = useMonacoTheme();
  return (
    <DiffEditor
      key={path}
      height="100%"
      original={original}
      modified={modified}
      language={languageFor(path)}
      theme={theme}
      options={{
        readOnly: true,
        originalEditable: false,
        renderSideBySide: sideBySide,
        hideUnchangedRegions: { enabled: true },
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
      }}
    />
  );
}
