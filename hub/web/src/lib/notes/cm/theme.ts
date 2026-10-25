import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

// Tailwind's default stacks, so the editor reads like the rest of the hub.
const SANS = "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

// Tailwind blue-600 / blue-400.
const LINK = { light: 'oklch(0.546 0.245 262.881)', dark: 'oklch(0.707 0.165 254.624)' };

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: MONO },
  {
    tag: [tags.processingInstruction, tags.url, tags.contentSeparator, tags.labelName],
    color: 'var(--muted-foreground)',
  },
  { tag: tags.quote, color: 'var(--muted-foreground)' },
]);

/** Colours come from the hub's CSS tokens, so they follow the `.dark` class; `dark` picks CodeMirror's base theme. */
export function noteTheme(dark: boolean): Extension {
  const link = dark ? LINK.dark : LINK.light;
  return [
    EditorView.theme(
      {
        '&': { height: '100%', color: 'var(--foreground)', backgroundColor: 'transparent' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': { fontFamily: SANS, lineHeight: '1.65', overflow: 'auto' },
        '.cm-content': { fontSize: '1rem', padding: '1rem 0 4rem', caretColor: 'var(--foreground)' },
        '.cm-line': { padding: '0 1.5rem' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
          { backgroundColor: 'color-mix(in oklch, var(--ring) 35%, transparent)' },
        '.cm-h1': { fontSize: '1.75em', lineHeight: '1.3', paddingTop: '0.4em' },
        '.cm-h2': { fontSize: '1.4em', lineHeight: '1.35', paddingTop: '0.3em' },
        '.cm-h3': { fontSize: '1.2em', paddingTop: '0.2em' },
        '.cm-h4, .cm-h5, .cm-h6': { fontSize: '1em' },
        '.cm-blockquote': {
          borderLeft: '3px solid var(--border)',
          paddingLeft: 'calc(1.5rem - 3px)',
          marginLeft: '1.5rem',
          color: 'var(--muted-foreground)',
        },
        '.cm-codeblock': { backgroundColor: 'var(--muted)', fontFamily: MONO, fontSize: '0.875em' },
        '.cm-inline-code': {
          backgroundColor: 'var(--muted)',
          borderRadius: '0.25rem',
          padding: '0.1em 0.3em',
          fontSize: '0.875em',
        },
        '.cm-md-link': { textDecoration: 'underline', textUnderlineOffset: '0.2em' },
        '.cm-wikilink': { color: link, textDecoration: 'underline', textUnderlineOffset: '0.2em' },
        '.cm-tag': {
          color: link,
          backgroundColor: `color-mix(in oklch, ${link} 12%, transparent)`,
          borderRadius: '0.25rem',
          padding: '0 0.2em',
        },
        '.cm-task-box': {
          width: '1em',
          height: '1em',
          margin: '0 0.35em 0 0',
          verticalAlign: '-0.125em',
          accentColor: 'var(--primary)',
          cursor: 'pointer',
        },
        '.cm-task-done': { color: 'var(--muted-foreground)', textDecoration: 'line-through' },
        '.cm-bullet': { color: 'var(--muted-foreground)' },
        '.cm-hr': {
          display: 'inline-block',
          width: '100%',
          verticalAlign: 'middle',
          borderTop: '1px solid var(--border)',
        },
        '.cm-image': {
          display: 'block',
          maxWidth: '100%',
          maxHeight: '32rem',
          borderRadius: '0.375rem',
          margin: '0.25rem 0',
        },
        '.cm-image-missing': {
          color: 'var(--muted-foreground)',
          fontStyle: 'italic',
          border: '1px dashed var(--border)',
          borderRadius: '0.25rem',
          padding: '0 0.3em',
        },
        '.cm-tooltip': {
          backgroundColor: 'var(--card)',
          color: 'var(--card-foreground)',
          border: '1px solid var(--border)',
          borderRadius: 'calc(var(--radius) - 2px)',
          overflow: 'hidden',
        },
        '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: SANS, fontSize: '0.875rem' },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: 'var(--accent)',
          color: 'var(--accent-foreground)',
        },
        '.cm-completionDetail': { color: 'var(--muted-foreground)' },
        '.cm-panels': { backgroundColor: 'var(--card)', color: 'var(--card-foreground)' },
        '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
        '.cm-searchMatch': {
          backgroundColor: 'color-mix(in oklch, oklch(0.769 0.188 70.08) 35%, transparent)',
        },
      },
      { dark },
    ),
    syntaxHighlighting(highlight),
  ];
}
