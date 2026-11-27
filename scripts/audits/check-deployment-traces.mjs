import fs from 'node:fs';
import path from 'node:path';
import { loadPageCatalogue } from '../content/page-catalogue.cjs';

const root = process.cwd();
const buildDir = path.resolve(root, process.env.NEXT_DIST_DIR || '.next');
const pagesDir = path.join(buildDir, 'server/pages');
const templates = loadPageCatalogue(root).flatMap(page => page.key ? [page.key, page.route] : []);
const aliases = JSON.parse(fs.readFileSync(path.join(root, 'config/pilot-route-aliases.json'), 'utf8')).routes;
const guarded = new Set([...templates.map(route => route === '/' ? '/index' : route), ...Object.values(aliases), '/api/artwork-voices']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const at = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(at) : [at];
  });
}

function routeFor(trace) {
  return `/${path.relative(pagesDir, trace).replace(/\\/g, '/').replace(/\.js\.nft\.json$/, '')}`;
}

const leaks = [];
let largest = { route: '', count: 0 };
for (const trace of walk(pagesDir).filter(file => file.endsWith('.js.nft.json'))) {
  const route = routeFor(trace);
  const files = JSON.parse(fs.readFileSync(trace, 'utf8')).files ?? [];
  if (!guarded.has(route) && !route.startsWith('/api/dev/') && !route.startsWith('/api/ccb/operator/')) continue;
  if (files.length > largest.count) largest = { route, count: files.length };
  for (const file of files) {
    const resolved = path.resolve(path.dirname(trace), file);
    const relative = path.relative(root, resolved).replace(/\\/g, '/');
    const emitted = resolved === path.join(buildDir, 'package.json') || resolved.startsWith(`${path.join(buildDir, 'server')}${path.sep}`);
    if (relative === '.env' || relative.startsWith('.env.') || relative.startsWith('data/') || relative.startsWith('public/') || (relative.startsWith('.cache/') && !emitted)) {
      leaks.push(`${route}: ${relative}`);
      if (leaks.length >= 20) break;
    }
  }
}

if (leaks.length) {
  console.error(`Deployment trace leaked local content:\n${leaks.join('\n')}`);
  process.exit(1);
}
if (largest.count > 2000) {
  console.error(`Deployment trace is unexpectedly broad: ${largest.route} has ${largest.count} files`);
  process.exit(1);
}
console.log(`Deployment traces are clean; largest page trace is ${largest.route} with ${largest.count} files.`);
