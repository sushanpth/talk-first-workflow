import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateEffect } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { findWikiLinks } from '../model.ts';
import { ATTACHMENT_SCHEME } from '../types.ts';
import { inCode, TAG } from './syntax.ts';
import { toggleTask } from './tasks.ts';

/** Dispatch to redraw widgets, e.g. once an attachment's blob URL is ready. */
export const refreshPreview = StateEffect.define<null>();

type ResolveAttachment = (id: string) => string | undefined;

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-task-box';
    box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done');
    // Keep the cursor where it is; the doc change redraws the box.
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      const spec = toggleTask(view.state, view.posAtDOM(box));
      if (spec) view.dispatch(spec);
    });
    return box;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'cm-bullet';
    dot.textContent = '•';
    return dot;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const rule = document.createElement('span');
    rule.className = 'cm-hr';
    return rule;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string | undefined,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.alt === this.alt && other.url === this.url;
  }

  toDOM(view: EditorView) {
    if (!this.url) {
      const missing = document.createElement('span');
      missing.className = 'cm-image-missing';
      missing.textContent = this.alt || 'image';
      return missing;
    }
    const img = document.createElement('img');
    img.className = 'cm-image';
    img.alt = this.alt;
    img.src = this.url;
    img.addEventListener('load', () => view.requestMeasure());
    return img;
  }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });

/** Line numbers the cursor or selection touches; none while the editor is blurred. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  const { doc } = view.state;
  for (const r of view.state.selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) lines.add(n);
  }
  return lines;
}

function lineDecos(state: EditorState, from: number, to: number, deco: Decoration, out: Range<Decoration>[]) {
  for (let pos = from; pos <= to; ) {
    const l = state.doc.lineAt(pos);
    out.push(deco.range(l.from));
    pos = l.to + 1;
  }
}

function build(view: EditorView, resolve: ResolveAttachment): DecorationSet {
  const { state } = view;
  const active = activeLines(view);
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const touched = (from: number, to: number) =>
    view.hasFocus && state.selection.ranges.some((r) => r.from <= to && r.to >= from);
  const out: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => {
    if (from < to) out.push(hidden.range(from, to));
  };
  const spaceAfter = (pos: number) => (state.sliceDoc(pos, pos + 1) === ' ' ? 1 : 0);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          const end = name.startsWith('Setext') ? state.doc.lineAt(node.to).from - 1 : node.to;
          lineDecos(state, node.from, Math.max(node.from, end), line(`cm-h${heading[1]}`), out);
          return;
        }
        switch (name) {
          case 'HeaderMark':
            if (!isActive(node.from)) hide(node.from, node.to + spaceAfter(node.to));
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (!isActive(node.from)) hide(node.from, node.to);
            return;
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode' && !isActive(node.from)) hide(node.from, node.to);
            return;
          case 'InlineCode':
            out.push(mark('cm-inline-code').range(node.from, node.to));
            return;
          case 'FencedCode':
          case 'CodeBlock':
            lineDecos(state, node.from, node.to, line('cm-codeblock'), out);
            return;
          case 'Blockquote':
            lineDecos(state, node.from, node.to, line('cm-blockquote'), out);
            return;
          case 'QuoteMark':
            if (!isActive(node.from)) hide(node.from, node.to + spaceAfter(node.to));
            return;
          case 'HorizontalRule':
            if (!isActive(node.from)) out.push(rule.range(node.from, node.to));
            return;
          case 'Link': {
            const open = node.node.firstChild;
            const close = open?.nextSibling;
            if (!open || close?.name !== 'LinkMark' || !node.node.getChild('URL')) return;
            if (open.to < close.from) out.push(mark('cm-md-link').range(open.to, close.from));
            if (!isActive(node.from)) {
              hide(open.from, open.to);
              hide(close.from, node.to);
            }
            return;
          }
          case 'Image': {
            const url = node.node.getChild('URL');
            const src = url ? state.sliceDoc(url.from, url.to) : '';
            if (!src.startsWith(ATTACHMENT_SCHEME)) return;
            const open = node.node.firstChild;
            const close = open?.nextSibling;
            const alt = open && close ? state.sliceDoc(open.to, close.from) : '';
            const widget = new ImageWidget(alt, resolve(src.slice(ATTACHMENT_SCHEME.length)));
            if (isActive(node.from)) out.push(Decoration.widget({ widget, side: 1 }).range(node.to));
            else out.push(Decoration.replace({ widget }).range(node.from, node.to));
            return false;
          }
          case 'ListItem': {
            const listMark = node.node.firstChild;
            if (listMark?.name !== 'ListMark') return;
            const task = listMark.nextSibling;
            const marker = task?.name === 'Task' ? task.firstChild : null;
            if (task && marker?.name === 'TaskMarker') {
              const checked = /x/i.test(state.sliceDoc(marker.from, marker.to));
              const box = Decoration.replace({ widget: new CheckboxWidget(checked) });
              if (!isActive(listMark.from)) out.push(box.range(listMark.from, marker.to));
              else if (!touched(marker.from, marker.to)) out.push(box.range(marker.from, marker.to));
              const text = marker.to + spaceAfter(marker.to);
              if (checked && text < task.to) out.push(mark('cm-task-done').range(text, task.to));
            } else if (node.node.parent?.name === 'BulletList' && !isActive(listMark.from)) {
              out.push(bullet.range(listMark.from, listMark.to));
            }
            return;
          }
        }
      },
    });
    wikiLinksAndTags(state, from, to, isActive, out);
  }
  return Decoration.set(out, true);
}

function wikiLinksAndTags(
  state: EditorState,
  from: number,
  to: number,
  isActive: (pos: number) => boolean,
  out: Range<Decoration>[],
) {
  for (let pos = from; pos <= to; ) {
    const l = state.doc.lineAt(pos);
    const showSource = isActive(l.from);
    for (const link of findWikiLinks(l.text, l.from)) {
      if (inCode(state, link.from)) continue;
      if (showSource) {
        out.push(mark('cm-wikilink').range(link.from, link.to));
        continue;
      }
      // Show only the alias when there is one; target and heading can't contain `|`.
      const bar = link.alias ? state.sliceDoc(link.from, link.to).indexOf('|') : -1;
      const textFrom = bar >= 0 ? link.from + bar + 1 : link.from + 2;
      out.push(hidden.range(link.from, textFrom));
      if (textFrom < link.to - 2) out.push(mark('cm-wikilink').range(textFrom, link.to - 2));
      out.push(hidden.range(link.to - 2, link.to));
    }
    for (const m of l.text.matchAll(TAG)) {
      const at = l.from + m.index;
      if (!inCode(state, at)) out.push(mark('cm-tag').range(at, at + m[0].length));
    }
    pos = l.to + 1;
  }
}

/** Shows formatting and hides markdown markers on lines away from the cursor. */
export function livePreview(resolveAttachment: () => ResolveAttachment) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, resolveAttachment());
      }

      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.focusChanged ||
          syntaxTree(u.startState) !== syntaxTree(u.state) ||
          u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshPreview)))
        ) {
          this.decorations = build(u.view, resolveAttachment());
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
