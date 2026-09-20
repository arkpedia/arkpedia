// Runs a page's existing data builder without running next build or publishing code.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
const [route, destination] = process.argv.slice(2);
if (!route || !destination) throw new Error('Expected route and output directory');
process.env.ARKPEDIA_EXPORT_CONTENT = '1';
process.env.NODE_ENV = 'production';
const stem = `pages${route}`;
const page = fs.existsSync(`${stem}.tsx`) ? `${stem}.tsx` : `${stem}/index.tsx`;
const dynamic = route.includes('[');
const bundle = path.resolve('.cache/content', createHash('sha256').update(route).digest('hex') + '.cjs');
await build({
  stdin: { contents: `export { getStaticProps${dynamic ? ', getStaticPaths' : ''} } from './${page}';`, resolveDir: process.cwd() },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', logLevel: 'warning', treeShaking: true,
  // Client components may declare Web Workers with import.meta.url. Content
  // export executes getStaticProps only; Next's browser build owns those
  // worker URLs, so the server-only CJS bundle never evaluates them.
  logOverride: { 'empty-import-meta': 'silent' },
  plugins: [{ name: 'data-only-styles', setup(builder) {
    builder.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {};', loader: 'js' }));
  } }],
  define: { 'process.env.ARKPEDIA_EXPORT_CONTENT': '"1"' },
});
const { getStaticProps, getStaticPaths } = createRequire(import.meta.url)(bundle);
const paths = dynamic ? (await getStaticPaths({})).paths : [{ params: {} }];
const entries = {};
for (const item of paths) {
  if (typeof item === 'string') throw new Error(`String static path is not supported: ${route}`);
  const params = item.params || {};
  const key = route.replace(/\[([^\]]+)\]/g, (_, name) => encodeURIComponent(params[name]));
  const result = await getStaticProps({ params, revalidateReason: 'build' });
  if (!('props' in result)) continue;
  const props = await result.props;
  const tables = route === '/planner' ? ['base-formulas', 'battle-records', 'supply-stages']
    : route === '/schedule' ? ['event_colors', 'event_materials', 'headhunting_banners']
    : route === '/stages/browse' ? ['stage-tile-legend'] : [];
  if (tables.length) props.__contentTables = Object.fromEntries(tables.map(name => [name, JSON.parse(fs.readFileSync(`data/${name}.json`, 'utf8'))]));
  const bytes = Buffer.from(JSON.stringify({ props }));
  // JSON.stringify must not silently erase unsupported top-level values.
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error(`Invalid props: ${key}`);
  const file = pageFilePath(key);
  if (fs.existsSync(path.join(destination, file))) throw new Error(`Duplicate page filename: ${file}`);
  fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true });
  fs.writeFileSync(path.join(destination, file), bytes);
  entries[key] = { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
fs.writeFileSync(path.join(destination, `entries-${createHash('sha256').update(route).digest('hex')}.json`), JSON.stringify(entries));
console.log(`${route}: ${Object.keys(entries).length} pages`);
