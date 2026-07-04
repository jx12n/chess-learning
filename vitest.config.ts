import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@chess/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
      '@chess/curriculum': fileURLToPath(
        new URL('./packages/curriculum/src/index.ts', import.meta.url),
      ),
      '@chess/verifier': fileURLToPath(
        new URL('./packages/verifier/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
