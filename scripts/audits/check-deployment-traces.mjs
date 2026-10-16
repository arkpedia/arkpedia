import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagesDir = path.join(root, '.next/server/pages');
const templates = JSON.parse(fs.readFileSync(path.join(root, 'scripts/content/pages.json'), 'utf8'));
const guarded = new Set([...templates.map(route => route === '/' ? '/index' : route), '/api/artwork-voices']);

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
  if (!guarded.has(route) && !route.startsWith('/api/dev/')) continue;
  if (files.length > largest.count) largest = { route, count: files.length };
  for (const file of files) {
    const resolved = path.resolve(path.dirname(trace), file);
    const relative = path.relative(root, resolved).replace(/\\/g, '/');
    if (relative === '.env' || relative.startsWith('.env.') || relative.startsWith('data/') || relative.startsWith('public/') || relative.startsWith('.cache/')) {
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
