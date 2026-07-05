import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    rollupOptions: {
      // Three documents: the landing page (the profile door), the lesson
      // itself, and the story page. Only the lesson entry pulls in WASM.
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play.html', import.meta.url)),
        about: fileURLToPath(new URL('./about.html', import.meta.url)),
      },
    },
  },
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
