import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/mapping-urban-data/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
