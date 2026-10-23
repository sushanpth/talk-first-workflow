import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { useSyncExternalStore } from 'react';

// Use the bundled Monaco instead of the loader's default CDN.
loader.config({ monaco });
// Vite inlines Monaco's own editor-worker URL as a data: URL that can't load its imports.
window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

const media = window.matchMedia('(prefers-color-scheme: dark)');
const subscribe = (notify: () => void) => {
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

function languageFor(path: string): string {
  const name = path.split('/').pop() ?? '';
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  const match = monaco.languages
    .getLanguages()
    .find((lang) => lang.filenames?.includes(name) || (ext && lang.extensions?.includes(ext)));
  return match?.id ?? 'plaintext';
}

interface DiffViewProps {
  path: string;
  original: string;
  modified: string;
  sideBySide: boolean;
}

export default function DiffView({ path, original, modified, sideBySide }: DiffViewProps) {
  const dark = useSyncExternalStore(subscribe, () => media.matches);
  return (
    <DiffEditor
      key={path}
      height="100%"
      original={original}
      modified={modified}
      language={languageFor(path)}
      theme={dark ? 'vs-dark' : 'vs'}
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
