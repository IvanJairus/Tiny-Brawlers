import { defineConfig } from 'vite';

export default defineConfig({
  // Relative so the same build works at a domain root and under a repo subpath.
  base: './',
  server: { host: true, port: 3000 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 700 }
});
