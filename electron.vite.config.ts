import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Electron build. Separate from vite.config.ts on purpose: that one still builds
 * the plain web app for Vercel, and neither should be able to break the other.
 *
 * The renderer root is the project root rather than src/renderer, because this
 * project started as a web app and index.html lives at the top level. `base` has
 * to be relative so the built assets resolve over file://.
 */
export default defineConfig({
  /*
   * Main and preload are emitted as CommonJS (.cjs), not ESM.
   *
   * The `electron` module is CJS, so ESM cannot statically see its named exports
   * — `import { BrowserWindow } from 'electron'` throws "does not provide an
   * export named 'BrowserWindow'" at startup. This package is "type": "module"
   * for the web build, which makes a bare .js file ESM, so the extension has to
   * be .cjs to opt these two entries back into CommonJS. Tomato Alarm avoids the
   * problem by having no "type" field at all.
   */
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: '.',
    base: './',
    plugins: [react(), tailwindcss()],
    // publicDir is OFF deliberately. Vite would otherwise copy everything in
    // public/ into the renderer bundle — including questions.seed.json, which
    // would put my real interview material inside the .app and therefore inside
    // any dmg I built. The fictional example bank is shipped explicitly instead,
    // via electron-builder's extraResources.
    publicDir: false,
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'index.html') } },
      outDir: 'out/renderer',
    },
  },
});
