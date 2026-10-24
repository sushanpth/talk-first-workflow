import { constants, type Stats } from 'node:fs';
import { type FileHandle, open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/**
 * The real path of `target` when it lies inside one of `roots`, else null.
 * Real paths on both sides, so symlinks and `..` can't escape a root.
 */
export async function realInside(roots: string[], target: string): Promise<string | null> {
  const real = await realpath(target).catch(() => null);
  if (!real) return null;
  for (const root of roots) {
    const realRoot = await realpath(root).catch(() => null);
    if (realRoot && isInside(realRoot, real)) return real;
  }
  return null;
}

export type FileRefusal = 'outside' | 'not a regular file';

/**
 * Calls `fn` with an open handle when `target`'s real path is a regular file inside `roots`,
 * then closes it. FIFOs and devices are refused without blocking.
 */
export async function withRegularFile<T>(
  roots: string[],
  target: string,
  fn: (handle: FileHandle, info: Stats, real: string) => Promise<T>,
): Promise<{ value: T } | { refused: FileRefusal }> {
  const real = await realInside(roots, target);
  if (!real) return { refused: 'outside' };
  // Stat before opening: opening a FIFO for reading blocks until a writer shows up.
  if (!(await stat(real).catch(() => null))?.isFile()) return { refused: 'not a regular file' };
  const handle = await open(real, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    // Checked again on the handle in case the file was swapped after the stat.
    const info = await handle.stat();
    if (!info.isFile()) return { refused: 'not a regular file' };
    return { value: await fn(handle, info, real) };
  } finally {
    await handle.close();
  }
}

/** The file's mtime as ISO 8601, or null when it can't be stat'ed. */
export async function modifiedAt(path: string): Promise<string | null> {
  const info = await stat(path).catch(() => null);
  return info ? info.mtime.toISOString() : null;
}
