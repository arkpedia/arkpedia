import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

/*
 * /bases/whole-base-optimizer was a public page (200) whose one request went to
 * /api/whole-base-optimizer-results, a route that has never existed -- the handler is
 * under /api/dev/ and answers only locally. /api/submit took survey submissions that
 * nothing sent any more and checked them against a folder that no longer exists, so
 * it would have refused every one (sweep 2026-09-24, §3.11). This holds the three
 * things that let both happen:
 * - every address client code fetches under /api/ is a route that exists;
 * - a page that calls a local-only route (pages/api/dev) is itself local-only;
 * - every API route has a known caller; development APIs share one gate.
 */
const ROOT = process.cwd();

function files(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

/** The /api/ addresses a file fetches, `${...}` kept as a placeholder segment. */
export function apiFetches(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['fetch', 'fetchOk', 'fetchAsset'].includes(node.expression.text) && node.arguments[0]) {
      const argument = node.arguments[0];
      const address = ts.isStringLiteralLike(argument) ? argument.text
        : ts.isTemplateExpression(argument) ? argument.head.text + argument.templateSpans.map(span => `\${}${span.literal.text}`).join('')
          : null;
      if (address?.startsWith('/api/')) found.push(address.split('?')[0]);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

/** The route file under pages/api that serves an address, or null. */
export function routeFor(address: string, routes: string[]): string | null {
  const segments = address.replace(/^\/api\//, '').split('/');
  return routes.find(route => {
    const parts = route.replace(/^pages\/api\//, '').replace(/\.tsx?$/, '').replace(/\/index$/, '').split('/');
    return parts.length === segments.length && parts.every((part, index) => /^\[[^\]]+\]$/.test(part) || part === segments[index]);
  }) ?? null;
}

const routes = files(path.join('pages', 'api')).map(file => file.split(path.sep).join('/'));
const client = ['pages', 'components', 'lib'].flatMap(dir => files(dir)).filter(file => !file.startsWith(path.join('pages', 'api')));
const fetches = client.flatMap(file => apiFetches(file, fs.readFileSync(path.join(ROOT, file), 'utf8')).map(address => ({ file, address })));

test('the scan reads fetch addresses the way the route table matches them', () => {
  assert.deepEqual(apiFetches('x.tsx', "fetch('/api/a'); fetch(`/api/b/${id}?x=1`); fetch(url); fetch('/other');"), ['/api/a', '/api/b/${}']);
  const table = ['pages/api/a.ts', 'pages/api/b/[id].ts', 'pages/api/dev/c.ts'];
  assert.equal(routeFor('/api/b/${}', table), 'pages/api/b/[id].ts');
  assert.equal(routeFor('/api/dev/c', table), 'pages/api/dev/c.ts');
  assert.equal(routeFor('/api/c', table), null);
  assert.equal(routeFor('/api/whole-base-optimizer-results', [...table, 'pages/api/dev/whole-base-optimizer-results.ts']), null);
});

test('every address client code fetches under /api/ is a route that exists', () => {
  assert.ok(fetches.length >= 5, 'the scan found almost no fetches');
  const missing = fetches.filter(({ address }) => !routeFor(address, routes)).map(({ file, address }) => `${file}: ${address}`);
  assert.deepEqual(missing, []);
});

test('a page that calls a local-only route is itself local-only', () => {
  const problems: string[] = [];
  for (const { file, address } of fetches.filter(({ address }) => address.startsWith('/api/dev/'))) {
    if (!file.startsWith(`pages${path.sep}`)) { problems.push(`${file} calls ${address} from a shared module; call it from the dev page itself`); continue; }
    if (!/export const getStaticProps = devOnlyStaticProps;/.test(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      problems.push(`${file} calls ${address} but is served in production; export const getStaticProps = devOnlyStaticProps`);
    }
  }
  assert.deepEqual([...new Set(problems)], []);
  // Not vacuous: the inspection tool and both optimizer pages are covered.
  assert.ok(fetches.some(({ file }) => file === path.join('pages', 'bases', 'whole-base-optimizer.tsx')));
});

/** API routes no page calls because a workflow does, each with the script that calls it. The
 *  script must name the route's address, so a renamed or dropped caller fails here. */
const CALLED_BY_WORKFLOWS: Record<string, string> = {
  // prepare-content.yml, once a release is live (lib/content/releaseRefresh.ts).
  'pages/api/release-refresh.ts': 'scripts/content/refresh-pages.mjs',
};

/** API routes the page names as an address it does not fetch (an image's src), each with the
 *  module that builds the address: it must name the route's fixed part (up to its first [param]),
 *  so a renamed or dropped caller fails here. */
const NAMED_AS_ADDRESSES: Record<string, string> = {
  // Monster Siren's album cover, served from this site: the lock screen's artwork and the
  // player's <img> (its CDN refuses requests from these pages).
  'pages/api/music-cover/[id].ts': 'lib/music/songArt.ts',
  // A Monster Siren song's audio, as the player's <audio> address: a redirect to the signed file,
  // so a press can set it and play at once (an iPhone starts sound only inside a press).
  'pages/api/music-audio/[id].ts': 'lib/music/audioElement.ts',
};

test('every API route has an actual client, workflow or address consumer', () => {
  const called = new Set(fetches.map(({ address }) => routeFor(address, routes)));
  const byWorkflow = (route: string) => route in CALLED_BY_WORKFLOWS
    && fs.readFileSync(path.join(ROOT, CALLED_BY_WORKFLOWS[route]), 'utf8').includes(`/api/${route.slice('pages/api/'.length).replace(/\.tsx?$/, '')}`);
  const asAddress = (route: string) => route in NAMED_AS_ADDRESSES
    && fs.readFileSync(path.join(ROOT, NAMED_AS_ADDRESSES[route]), 'utf8').includes(`/api/${route.slice('pages/api/'.length).split('[')[0]}`);
  const orphans = routes.filter(route => !called.has(route) && !byWorkflow(route) && !asAddress(route));
  assert.deepEqual(orphans, []);
  for (const route of Object.keys(CALLED_BY_WORKFLOWS)) assert.ok(byWorkflow(route), `${CALLED_BY_WORKFLOWS[route]} calls ${route}`);
  for (const route of Object.keys(NAMED_AS_ADDRESSES)) assert.ok(asAddress(route), `${NAMED_AS_ADDRESSES[route]} names ${route}`);
});

test('every development API uses the shared gate and contains no direct filesystem writes', () => {
  for (const route of routes.filter(file => file.startsWith('pages/api/dev/'))) {
    const source = fs.readFileSync(path.join(ROOT, route), 'utf8');
    assert.match(source, /export default devOnlyApi\(/, route);
    assert.doesNotMatch(source, /process\.env\.NODE_ENV/, route);
  }
  for (const route of routes) {
    const source = fs.readFileSync(path.join(ROOT, route), 'utf8');
    assert.doesNotMatch(source, /\b(?:writeFile(?:Sync)?|copyFile(?:Sync)?|mkdir(?:Sync)?|appendFile(?:Sync)?|createWriteStream)\s*\(/, route);
  }
});
