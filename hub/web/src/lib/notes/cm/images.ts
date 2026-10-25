import { type EditorState, StateEffect, StateField, type Transaction } from '@codemirror/state';
import { ATTACHMENT_SCHEME } from '../types.ts';

export function imageMarkdown(name: string, id: string): string {
  return `![${name.replace(/[\\[\]]/g, '\\$&')}](${ATTACHMENT_SCHEME}${id})`;
}

export function imagesOf(files: Iterable<File>): File[] {
  return [...files].filter((file) => file.type.startsWith('image/'));
}

const addPending = StateEffect.define<{ token: number; pos: number }>();
const dropPending = StateEffect.define<number>();

/** Required by `insertImages`: maps paste positions through edits made while images save. */
export const imagePaste = StateField.define<ReadonlyMap<number, number>>({
  create: () => new Map(),
  update(value, tr) {
    const changed = tr.effects.some((e) => e.is(addPending) || e.is(dropPending));
    if (!tr.docChanged && !changed) return value;
    const next = new Map([...value].map(([token, pos]) => [token, tr.changes.mapPos(pos, -1)]));
    for (const effect of tr.effects) {
      if (effect.is(addPending)) next.set(effect.value.token, effect.value.pos);
      if (effect.is(dropPending)) next.delete(effect.value);
    }
    return next;
  },
});

interface Target {
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
}

let nextToken = 0;

/** Saves each image with `save`, then inserts its ref at `pos` (default: the cursor). Failed saves are skipped. */
export async function insertImages(
  target: Target,
  files: readonly File[],
  save: (file: File) => Promise<string>,
  pos = target.state.selection.main.head,
): Promise<void> {
  const token = nextToken++;
  target.dispatch(target.state.update({ effects: addPending.of({ token, pos }) }));
  const results = await Promise.allSettled(files.map(save));
  const refs: string[] = [];
  files.forEach((file, i) => {
    const result = results[i];
    if (result?.status === 'fulfilled') refs.push(imageMarkdown(file.name, result.value));
    else console.error('Could not save a pasted image', result?.reason);
  });
  const { state } = target;
  const at = state.field(imagePaste, false)?.get(token) ?? state.selection.main.head;
  const insert = refs.join('\n');
  const cursor = state.selection.main;
  target.dispatch(
    state.update({
      changes: insert ? { from: at, insert } : undefined,
      selection: insert && cursor.empty && cursor.head === at ? { anchor: at + insert.length } : undefined,
      effects: dropPending.of(token),
      userEvent: 'input.paste',
    }),
  );
}
