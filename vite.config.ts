import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { buildStamp, pixelFontSubset } from './scripts/vite-plugins.mjs';

const stamp = buildStamp();

// base: './' makes every asset path relative, so the build works at any
// GitHub Pages path (https://<user>.github.io/<repo>/) or a custom domain.
export default defineConfig({
  base: './',
  plugins: [pixelFontSubset(), react()],
  define: {
    __BUILD_SHA__: JSON.stringify(stamp.sha),
    __BUILD_DATE__: JSON.stringify(stamp.date),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
