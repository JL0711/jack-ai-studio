import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' makes every asset path relative, so the build works at any
// GitHub Pages path (https://<user>.github.io/<repo>/) or a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
