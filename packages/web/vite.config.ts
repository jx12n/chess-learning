import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@chess/core': fileURLToPath(
        new URL('../core/src/index.ts', import.meta.url),
      ),
      '@chess/curriculum': fileURLToPath(
        new URL('../curriculum/src/index.ts', import.meta.url),
      ),
      '@chess/verifier': fileURLToPath(
        new URL('../verifier/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    fs: {
      // The WASM artifact and workspace sources live outside this package.
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
});
