import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/* In production the app is served from the repo root on GitHub Pages and
   fetches the committed geometry snapshots at <base>/mockups/data/…. The
   dev server's root is app/, so this tiny middleware serves the same
   files from the repo checkout — no 31MB duplication into public/. */
function serveRepoData(): Plugin {
  const dataDir = path.resolve(__dirname, '../mockups/data');
  return {
    name: 'serve-repo-data',
    configureServer(server) {
      server.middlewares.use('/mockups/data', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = path.join(dataDir, rel);
        if (!file.startsWith(dataDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('content-type', 'application/json');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: '/sf-block-report/',
  plugins: [serveRepoData()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
