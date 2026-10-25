import { describe, expect, it, vi } from 'vitest';
import { imageMarkdown, imagePaste, imagesOf, insertImages } from './images.ts';
import { show, stateOf, target } from './test-utils.ts';

const png = (name: string) => new File([new Uint8Array([1])], name, { type: 'image/png' });

describe('imageMarkdown', () => {
  it('links the attachment id and escapes brackets in the name', () => {
    expect(imageMarkdown('shot.png', 'a1')).toBe('![shot.png](attachment:a1)');
    expect(imageMarkdown('a [b] \\c.png', 'a1')).toBe('![a \\[b\\] \\\\c.png](attachment:a1)');
  });
});

describe('imagesOf', () => {
  it('keeps only image files', () => {
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    expect(imagesOf([text, png('a.png')]).map((f) => f.name)).toEqual(['a.png']);
  });
});

describe('insertImages', () => {
  it('saves each image and inserts its ref at the cursor', async () => {
    const t = target(stateOf('see | here', [imagePaste]));
    const saved: string[] = [];
    await insertImages(t, [png('a.png'), png('b.png')], async (file) => {
      saved.push(file.name);
      return `id-${file.name}`;
    });
    expect(saved).toEqual(['a.png', 'b.png']);
    expect(show(t.state)).toBe('see ![a.png](attachment:id-a.png)\n![b.png](attachment:id-b.png)| here');
  });

  it('inserts at the paste position even if the doc changes while saving', async () => {
    const t = target(stateOf('ab|', [imagePaste]));
    let release = () => {};
    const done = insertImages(
      t,
      [png('a.png')],
      () => new Promise((resolve) => (release = () => resolve('x'))),
    );
    t.dispatch(t.state.update({ changes: { from: 0, insert: 'START ' } }));
    t.dispatch(t.state.update({ changes: { from: t.state.doc.length, insert: ' typed' } }));
    release();
    await done;
    expect(t.state.doc.toString()).toBe('START ab![a.png](attachment:x) typed');
  });

  it('skips images that fail to save', async () => {
    const t = target(stateOf('|', [imagePaste]));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await insertImages(t, [png('bad.png'), png('ok.png')], async (file) => {
      if (file.name === 'bad.png') throw new Error('quota');
      return 'ok';
    });
    expect(t.state.doc.toString()).toBe('![ok.png](attachment:ok)');
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
