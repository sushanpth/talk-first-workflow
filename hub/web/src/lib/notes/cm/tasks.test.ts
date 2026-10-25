import { describe, expect, it } from 'vitest';
import { toggleTask } from './tasks.ts';
import { stateOf } from './test-utils.ts';

function toggle(doc: string, line: number): string | null {
  const state = stateOf(doc);
  const spec = toggleTask(state, state.doc.line(line).from);
  return spec ? state.update(spec).state.doc.toString() : null;
}

describe('toggleTask', () => {
  it('ticks an open checkbox', () => {
    expect(toggle('- [ ] milk\n- [ ] eggs', 2)).toBe('- [ ] milk\n- [x] eggs');
  });

  it('unticks a ticked checkbox, upper or lower case', () => {
    expect(toggle('- [x] milk', 1)).toBe('- [ ] milk');
    expect(toggle('- [X] milk', 1)).toBe('- [ ] milk');
  });

  it('works on nested, numbered and quoted items', () => {
    expect(toggle('- a\n    - [ ] b', 2)).toBe('- a\n    - [x] b');
    expect(toggle('1. [ ] a', 1)).toBe('1. [x] a');
    expect(toggle('> - [ ] a', 1)).toBe('> - [x] a');
  });

  it('leaves lines without a checkbox alone', () => {
    expect(toggle('- milk', 1)).toBeNull();
    expect(toggle('[ ] not a list', 1)).toBeNull();
  });
});
