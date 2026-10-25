import { describe, expect, it } from 'vitest';
import {
  dailyTitle,
  folderTree,
  groupByDate,
  linkedMentions,
  linkMention,
  noteSnippet,
  noteTitle,
  outline,
  parseLinks,
  parseTags,
  resolveLink,
  toggleTask,
  unlinkedMentions,
} from './model.ts';
import { NO_FOLDER, type Note } from './types.ts';

const note = (over: Partial<Note> & { id: string }): Note => ({
  title: 'New note',
  body: '',
  folderId: NO_FOLDER,
  tags: [],
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('noteTitle', () => {
  it('uses the first non-empty line without markdown markers', () => {
    expect(noteTitle('\n\n# Groceries\nmilk')).toBe('Groceries');
    expect(noteTitle('- [ ] **buy** _milk_')).toBe('buy milk');
    expect(noteTitle('> a [link](https://example.com) and `code`')).toBe('a link and code');
    expect(noteTitle('see [[Groceries|the list]] and [[Plans]]')).toBe('see the list and Plans');
  });

  it('falls back to "New note" for a blank body', () => {
    expect(noteTitle('')).toBe('New note');
    expect(noteTitle('  \n#  \n')).toBe('New note');
  });
});

describe('parseTags', () => {
  it('finds lowercase tags without the hash, once each', () => {
    expect(parseTags('#Work notes #home/kitchen and #work again')).toEqual(['work', 'home/kitchen']);
  });

  it('skips headings, numbers, code, links and URLs', () => {
    const body = [
      '# Heading',
      'issue #123 is not a tag',
      '`#inline` code',
      '```',
      '#fenced',
      '```',
      '[see #this](https://example.com/#anchor) and [[note#heading]]',
      'real #tag',
    ].join('\n');
    expect(parseTags(body)).toEqual(['tag']);
  });
});

describe('parseLinks', () => {
  it('reads targets, aliases and headings with their offsets', () => {
    const body = 'go to [[Groceries]] or [[Plans#Next week|next]]';
    expect(parseLinks(body)).toEqual([
      { target: 'Groceries', from: 6, to: 19 },
      { target: 'Plans', heading: 'Next week', alias: 'next', from: 23, to: body.length },
    ]);
  });

  it('ignores links in code', () => {
    expect(parseLinks('`[[a]]`\n```\n[[b]]\n```\n[[c]]').map((l) => l.target)).toEqual(['c']);
  });
});

describe('outline', () => {
  it('lists headings outside code fences with their levels', () => {
    const body = '# Title\ntext\n## Part **one**\n```\n# not a heading\n```\n### Deep';
    expect(outline(body).map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Part one' },
      { level: 3, text: 'Deep' },
    ]);
  });
});

describe('groupByDate', () => {
  // Saturday 25 October 2026, 15:00 local time.
  const now = new Date(2026, 9, 25, 15).getTime();
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  it('puts pinned notes first, then recent days, then months', () => {
    const notes = [
      note({ id: 'old', updatedAt: at(2026, 7, 2) }),
      note({ id: 'today', updatedAt: at(2026, 9, 25, 9) }),
      note({ id: 'pin', updatedAt: at(2025, 0, 1), pinned: true }),
      note({ id: 'yesterday', updatedAt: at(2026, 9, 24, 23) }),
      note({ id: 'week', updatedAt: at(2026, 9, 19) }),
      note({ id: 'month', updatedAt: at(2026, 9, 1) }),
      note({ id: 'older', updatedAt: at(2025, 11, 31) }),
      note({ id: 'today2', updatedAt: at(2026, 9, 25, 10) }),
    ];
    const groups = groupByDate(notes, now).map((g) => [g.label, g.notes.map((n) => n.id)]);
    expect(groups).toEqual([
      ['Pinned', ['pin']],
      ['Today', ['today2', 'today']],
      ['Yesterday', ['yesterday']],
      ['Previous 7 Days', ['week']],
      ['Previous 30 Days', ['month']],
      ['August 2026', ['old']],
      ['December 2025', ['older']],
    ]);
  });
});

describe('dailyTitle', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(dailyTitle(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('resolveLink', () => {
  const notes = [
    note({ id: 'a', title: 'Groceries', updatedAt: 1 }),
    note({ id: 'b', title: 'groceries', updatedAt: 5 }),
    note({ id: 'c', title: 'hub-local-web-ui' }),
  ];

  it('matches a note title case-insensitively, newest first', () => {
    expect(resolveLink('GROCERIES', { notes })).toEqual({ kind: 'note', noteId: 'b' });
  });

  it('prefers a note over a memory note of the same name', () => {
    expect(
      resolveLink('hub-local-web-ui', { notes, project: 'p', memoryNames: ['hub-local-web-ui'] }),
    ).toEqual({ kind: 'note', noteId: 'c' });
  });

  it("falls back to the project's memory notes, then unresolved", () => {
    const ctx = { notes, project: 'example-project', memoryNames: ['Roadmap'] };
    expect(resolveLink('roadmap', ctx)).toEqual({
      kind: 'memory',
      project: 'example-project',
      name: 'Roadmap',
    });
    expect(resolveLink('roadmap', { notes, memoryNames: ['Roadmap'] })).toEqual({
      kind: 'unresolved',
      target: 'roadmap',
    });
    expect(resolveLink('nothing', ctx)).toEqual({ kind: 'unresolved', target: 'nothing' });
  });
});

describe('mentions', () => {
  const target = note({ id: 't', title: 'Groceries', body: '# Groceries' });
  const notes = [
    target,
    note({ id: 'linked', title: 'Plan', body: 'buy from [[groceries|the list]]' }),
    note({ id: 'plain', title: 'Diary', body: 'did the groceries today' }),
    note({ id: 'deleted', body: '[[Groceries]]', deletedAt: 1 }),
    note({ id: 'none', body: 'nothing here' }),
  ];

  it('finds live notes that link to the note', () => {
    expect(linkedMentions(target, notes).map((n) => n.id)).toEqual(['linked']);
  });

  it('finds live notes that mention the title without linking it', () => {
    const found = unlinkedMentions(target, notes);
    expect(found.map((m) => m.note.id)).toEqual(['plain']);
    expect(found[0]?.snippet).toContain('groceries');
  });

  it('links the first plain mention', () => {
    expect(linkMention('did the groceries, groceries', 'Groceries')).toBe('did the [[groceries]], groceries');
    expect(linkMention('[[Groceries]] only', 'Groceries')).toBe('[[Groceries]] only');
  });
});

describe('toggleTask', () => {
  it('ticks and unticks the checkbox of the list item at the offset', () => {
    const body = 'list\n- [ ] milk\n  - [x] eggs';
    const ticked = toggleTask(body, 5);
    expect(ticked).toBe('list\n- [x] milk\n  - [x] eggs');
    expect(toggleTask(ticked, body.indexOf('  -'))).toBe('list\n- [x] milk\n  - [ ] eggs');
  });

  it('leaves the body alone when there is no checkbox there', () => {
    expect(toggleTask('- milk', 0)).toBe('- milk');
  });
});

describe('noteSnippet', () => {
  it('shows the first line after the title, without markers', () => {
    expect(noteSnippet('# Groceries\n\n- [ ] **milk**\n- eggs')).toBe('milk');
    expect(noteSnippet('# Only a title')).toBe('');
  });
});

describe('folderTree', () => {
  it('lists folders depth first by name, with their paths', () => {
    const tree = folderTree([
      { id: 'w', name: 'work' },
      { id: 's', name: 'Sub', parentId: 'w' },
      { id: 'h', name: 'Home' },
      { id: 'o', name: 'Orphan', parentId: 'gone' },
    ]);
    expect(tree.map(({ folder, depth, path }) => [folder.id, depth, path])).toEqual([
      ['h', 0, 'Home'],
      ['o', 0, 'Orphan'],
      ['w', 0, 'work'],
      ['s', 1, 'work / Sub'],
    ]);
  });
});
