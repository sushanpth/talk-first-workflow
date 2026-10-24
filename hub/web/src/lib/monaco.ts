import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { useIsDark } from '@/lib/theme';

// Import only from lazy chunks: this pulls in all of Monaco.

// Use the bundled Monaco instead of the loader's default CDN.
loader.config({ monaco });
// Vite inlines Monaco's own editor-worker URL as a data: URL that can't load its imports.
window.MonacoEnvironment = { getWorker: () => new EditorWorker() };
// Only the editor worker is bundled, so turn off the language services that need their own; highlighting stays.
for (const defaults of [
  monaco.typescript.typescriptDefaults,
  monaco.typescript.javascriptDefaults,
  monaco.css.cssDefaults,
  monaco.css.scssDefaults,
  monaco.css.lessDefaults,
  monaco.html.htmlDefaults,
  monaco.html.handlebarDefaults,
  monaco.html.razorDefaults,
]) {
  defaults.setModeConfiguration({});
}
monaco.json.jsonDefaults.setModeConfiguration({ tokens: true });

export { monaco };

export function useMonacoTheme(): 'vs' | 'vs-dark' {
  return useIsDark() ? 'vs-dark' : 'vs';
}

export function languageFor(path: string): string {
  const name = path.split('/').pop() ?? '';
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  const match = monaco.languages
    .getLanguages()
    .find((lang) => lang.filenames?.includes(name) || (ext && lang.extensions?.includes(ext)));
  return match?.id ?? 'plaintext';
}
