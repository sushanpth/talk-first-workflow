import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { run } from './run.ts';
import { MEMORY_PY } from './state.ts';
import {
  type Dump,
  dumpSchema,
  type MemoryProject,
  type MemoryStatus,
  memoryProjectSchema,
  memoryStatusSchema,
} from './types.ts';

const python = () => process.env.TALK_FIRST_PYTHON ?? 'python3';

async function memoryJson<T extends z.ZodType>(schema: T, args: string[]): Promise<z.infer<T>> {
  const out = await run(python(), [MEMORY_PY, ...args]);
  return schema.parse(JSON.parse(out));
}

export function memoryProjects(): Promise<MemoryProject[]> {
  return memoryJson(memoryProjectSchema.array(), ['projects']);
}

export function memoryStatus(cwd: string): Promise<MemoryStatus> {
  return memoryJson(memoryStatusSchema, ['--cwd', cwd, 'status']);
}

/** Changes whenever a file in the folder is added, removed or modified. */
async function signature(dir: string): Promise<string> {
  const parts: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.md')) {
        const info = await stat(full).catch(() => null);
        if (info) parts.push(`${full}:${info.mtimeMs}:${info.size}`);
      }
    }
  };
  await walk(dir);
  return parts.sort().join('\n');
}

const dumps = new Map<string, { signature: string; dump: Dump }>();

export async function memoryDump(dir: string): Promise<Dump> {
  const current = await signature(dir);
  const cached = dumps.get(dir);
  if (cached && cached.signature === current) return cached.dump;
  const dump = await memoryJson(dumpSchema, ['dump', '--dir', dir]);
  dumps.set(dir, { signature: current, dump });
  return dump;
}
