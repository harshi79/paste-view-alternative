import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Component regression tests render React JSX in .tsx. This project does
  // not depend on @vitejs/plugin-react, so configure Vite's built-in Oxc
  // transform to use the automatic JSX runtime (React 19) — no new
  // dependency needed. The app itself is still compiled by Next.js.
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    environment: 'node',
  },
});
