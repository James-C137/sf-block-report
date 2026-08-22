/* Copy the built app to the repository root, where GitHub Pages serves
   the main branch from. Replaces root index.html and the root assets/
   directory; touches nothing else (mockups/ stays intact). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const root = path.resolve(here, '../..');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

fs.rmSync(path.join(root, 'assets'), { recursive: true, force: true });
fs.cpSync(path.join(dist, 'assets'), path.join(root, 'assets'), { recursive: true });
fs.copyFileSync(path.join(dist, 'index.html'), path.join(root, 'index.html'));

const shipped = fs.readdirSync(path.join(root, 'assets'));
console.log(`Deployed to repo root: index.html + assets/ (${shipped.join(', ')})`);
