import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Web modules import each other through `@/`, as in web/vite.config.ts.
export default defineConfig({
  resolve: { alias: { '@': join(import.meta.dirname, 'web', 'src') } },
});
