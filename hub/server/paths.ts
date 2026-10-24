import { realpath, stat } from 'node:fs/promises';
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

/** The file's mtime as ISO 8601, or null when it can't be stat'ed. */
export async function modifiedAt(path: string): Promise<string | null> {
  const info = await stat(path).catch(() => null);
  return info ? info.mtime.toISOString() : null;
}
