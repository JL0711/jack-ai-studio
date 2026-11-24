import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { buildStamp, pixelFontSubset, preloadFonts } from './scripts/vite-plugins.mjs';

const stamp = buildStamp();

// base: './' makes every asset path relative, so the build works at any
// GitHub Pages path (https://<user>.github.io/<repo>/) or a custom domain.
export default defineConfig({
  base: './',
  // Preload only the pixel font (~22 KB): it is on the first screen in every language,
  // and arriving late it made the status line above the headline reflow and push the
  // page down. Hubot Sans (93 KB) is not preloaded: on 3G it would delay the first paint.
  plugins: [pixelFontSubset(), react(), preloadFonts([/pixel-subset-[^/]*\.woff2$/])],
  define: {
    __BUILD_SHA__: JSON.stringify(stamp.sha),
    __BUILD_DATE__: JSON.stringify(stamp.date),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Libraries in their own files: they change far less often than the site,
        // so returning visitors keep them cached across deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
