import { describe, expect, it } from 'vitest';
import { continueList, indentList, outdentList } from './lists.ts';
import { show, stateOf, target } from './test-utils.ts';

function enter(doc: string): string {
  const t = target(stateOf(doc));
  expect(continueList(t)).toBe(true);
  return show(t.state);
}

describe('Enter in a list', () => {
  it('continues a bullet list', () => {
    expect(enter('- milk|')).toBe('- milk\n- |');
  });

  it('continues a numbered list with the next number', () => {
    expect(enter('1. milk|')).toBe('1. milk\n2. |');
  });

  it('continues a checklist with an unticked box, also after a ticked one', () => {
    expect(enter('- [ ] milk|')).toBe('- [ ] milk\n- [ ] |');
    expect(enter('- [x] milk|')).toBe('- [x] milk\n- [ ] |');
  });

  it('keeps the indent of a nested item', () => {
    expect(enter('- milk\n    - oat|')).toBe('- milk\n    - oat\n    - |');
  });

  it('splits an item when the cursor is mid-text', () => {
    expect(enter('- milk| eggs')).toBe('- milk\n- | eggs');
  });

  it('does not add markers outside a list', () => {
    expect(enter('milk|')).toBe('milk\n|');
  });
});

describe('Enter on an empty item', () => {
  it('ends a bullet list with a blank line', () => {
    expect(enter('- milk\n- |')).toBe('- milk\n\n|');
  });

  it('ends a checklist', () => {
    expect(enter('- [ ] milk\n- [ ] |')).toBe('- [ ] milk\n\n|');
  });

  it('ends a numbered list', () => {
    expect(enter('1. milk\n2. |')).toBe('1. milk\n\n|');
  });

  it('only clears a lone item after a blank line or at the top', () => {
    expect(enter('- |')).toBe('|');
    expect(enter('text\n\n- |')).toBe('text\n\n|');
  });

  it('moves a nested empty item out one level', () => {
    expect(enter('- milk\n    - |')).toBe('- milk\n- |');
  });
});

describe('Tab and Shift+Tab', () => {
  it('indents an item under the one above, and back out', () => {
    const t = target(stateOf('- milk\n- oat|'));
    expect(indentList(t)).toBe(true);
    expect(show(t.state)).toBe('- milk\n    - oat|');
    expect(outdentList(t)).toBe(true);
    expect(show(t.state)).toBe('- milk\n- oat|');
  });
});
