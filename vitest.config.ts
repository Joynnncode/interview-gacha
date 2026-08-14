import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.ts on purpose: the tests cover the data layer, so
 * they need neither the React nor the Tailwind plugin, and the app build config
 * should not have to know that tests exist.
 */
export default defineConfig({
  test: {
    // The data layer is browser-shaped but not DOM-shaped: it needs IndexedDB
    // and Blob, both of which fake-indexeddb and Node itself provide.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
