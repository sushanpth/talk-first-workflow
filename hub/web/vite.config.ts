import { homedir } from 'node:os';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same default as hubPaths() in server/state.ts; the launcher passes --outDir explicitly.
const hubHome = process.env.TALK_FIRST_HUB_HOME ?? join(homedir(), '.cache', 'talk-first-workflow', 'hub');

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': join(import.meta.dirname, 'src') } },
  build: {
    outDir: join(hubHome, 'dist'),
    emptyOutDir: true,
    // Monaco is one large lazy chunk on purpose; it only loads on the worktree page.
    chunkSizeWarningLimit: 10_000,
  },
});
