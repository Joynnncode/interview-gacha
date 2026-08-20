import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
   * Scan only the real entry point.
   *
   * Vite's dependency scanner otherwise crawls every index.html in the project,
   * which after a desktop build includes out/renderer/index.html — a bundle
   * that references framer-motion's optional @emotion/is-prop-valid and makes
   * `npm run dev` print a resolution error that has nothing to do with the web
   * app. Pointing it at index.html keeps out/ out of it.
   */
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    open: true,
  },
});
