import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { PINNED_ART } from '../../lib/assets/assetUrl';

/*
 * A data file imported by client code is compiled into the deploy. An asset address in
 * it pinned to a commit is then frozen at whatever commit that deploy saw, while the
 * page's own art follows the content release. data/operator-icon-overrides.json did
 * exactly that: /schedule and the Persona event page drew Makoto Yuki, Aegis and Yukari
 * Takeba from image-assets 1b2907e for weeks after the release had moved on (sweep
 * 2026-09-24, §3.6).
 *
 * This walks the import graph the browser gets -- every page, minus what Next strips
 * with getStaticProps, and everything those modules import -- and reads each data file
 * it reaches. The graph over-approximates (a whole module counts once imported, as a
 * bundler without tree-shaking would see it), so a file it does not reach is certainly
 * not in the client bundle.
 *
 * - No reached data file may hold a commit-pinned asset address, except the catalogue
 *   records the daily release writes (CATALOGUE below): the catalogue sync externalises
 *   new art as pinned addresses and refresh-media-pins moves them each release, so they
 *   are data, not code, and the pins in them are the release's own.
 * - Every pinned address in a reached catalogue record must be one contentUrl()
 *   re-pins to the page's release, so a copy compiled into the deploy still renders
 *   the release's art.
 * data/assets/revisions.json holds bare revisions, not addresses: it is the deploy pin
 * contentUrl falls back to on a page without a release, by design.
 */
const ROOT = process.cwd();
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx'];
const SERVER_ONLY_EXPORTS = new Set(['getStaticProps', 'getStaticPaths', 'getServerSideProps']);
const PINNED = /https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-[a-z-]+\/[a-f0-9]{40}\/[^"\s]*/g;
const VOICE = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-voice-(?:japanese|english|mandarin|korean|regional)\/[a-f0-9]{40}\//;
/** Written by scripts/sync/sync-catalogue.mjs, pins included. */
const CATALOGUE = [/^data\/skins\.json$/, /^data\/headhunting_banners\.json$/, /^data\/events\/events_\d{4}\.json$/, /^data\/operators-\dstar\/[^/]+\.json$/];

function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ? path.join(ROOT, specifier.slice(2))
    : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
  if (!base) return null; // a package
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

/** Identifiers a node uses as values: type positions are erased before bundling. */
function valueNames(node: ts.Node, into = new Set<string>()): Set<string> {
  if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return into;
  if (ts.isIdentifier(node)) into.add(node.text);
  node.forEachChild(child => { valueNames(child, into); });
  return into;
}

function declaredNames(statement: ts.Statement): string[] {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) return [statement.name.text];
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(d => [...valueNames(d.name)]);
  if (ts.isEnumDeclaration(statement)) return [statement.name.text];
  return [];
}

const isExported = (statement: ts.Statement) => ts.canHaveModifiers(statement)
  && (ts.getModifiers(statement) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);

/**
 * The modules a file pulls into the client. For a page, the statements Next's SSG
 * transform removes -- getStaticProps and its kin, then whatever only they used --
 * do not count; the fixed point below is that transform's.
 */
export function clientImports(file: string, text: string, page: boolean): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const live: ts.Statement[] = [];
  const optional: ts.Statement[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    const names = declaredNames(statement);
    if (page && isExported(statement) && names.some(name => SERVER_ONLY_EXPORTS.has(name))) continue;
    if (!page || isExported(statement) || names.length === 0) live.push(statement); else optional.push(statement);
  }
  const used = new Set<string>();
  live.forEach(statement => valueNames(statement, used));
  for (let grew = true; grew;) {
    grew = false;
    for (const statement of optional) {
      if (!live.includes(statement) && declaredNames(statement).some(name => used.has(name))) {
        live.push(statement);
        valueNames(statement, used);
        grew = true;
      }
    }
  }
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause) { specifiers.push(statement.moduleSpecifier.text); continue; } // side effects
    if (clause.isTypeOnly) continue;
    const bound = [clause.name?.text, ...(clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? [clause.namedBindings.name.text]
      : clause.namedBindings?.elements.filter(e => !e.isTypeOnly).map(e => e.name.text) ?? [])];
    if (bound.some(name => name && used.has(name))) specifiers.push(statement.moduleSpecifier.text);
  }
  const visit = (node: ts.Node) => {
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      specifiers.push(node.arguments[0].text);
    }
    node.forEachChild(visit);
  };
  live.forEach(visit); // re-exports are live statements: they declare nothing
  return [...new Set(specifiers)];
}

function pagesUnder(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return file === path.join('pages', 'api') ? [] : pagesUnder(file);
    return /\.tsx?$/.test(entry.name) && entry.name !== '_document.tsx' ? [file] : [];
  });
}

/** Every data file the client bundle can hold, with the import chain that reaches it. */
function clientDataFiles(): Map<string, string[]> {
  const via = new Map<string, string[]>();
  const queue: [string, string[]][] = pagesUnder('pages').map(page => [path.join(ROOT, page), [page]]);
  const seen = new Set<string>();
  for (let item = queue.shift(); item; item = queue.shift()) {
    const [file, chain] = item;
    if (seen.has(file)) continue;
    seen.add(file);
    const relative = path.relative(ROOT, file);
    if (file.endsWith('.json')) { if (relative.startsWith('data/')) via.set(relative, chain); continue; }
    if (!/\.(?:tsx?|m?js|cjs)$/.test(file)) continue;
    const page = relative.startsWith(`pages${path.sep}`);
    for (const specifier of clientImports(file, fs.readFileSync(file, 'utf8'), page)) {
      const target = resolve(file, specifier);
      if (target && !seen.has(target)) queue.push([target, [...chain, path.relative(ROOT, target)]]);
    }
  }
  return via;
}

test('the walker follows what the browser loads and drops what Next strips', () => {
  const page = `
    import type { T } from '@/lib/typeOnly';
    import { Shape } from '@/lib/typeUse';
    import { forProps } from '@/lib/serverOnly';
    import { helperOnlyForProps } from '@/lib/serverHelper';
    import { render } from '@/lib/client';
    import '@/styles/x.css';
    const cache = helperOnlyForProps();
    function fromProps() { return forProps(cache); }
    export const getStaticProps = async () => ({ props: { value: fromProps() } });
    export default function Page(props: Shape) { const lazy = () => import('@/lib/lazy'); return render(props as T, lazy); }`;
  assert.deepEqual(clientImports('pages/x.tsx', page, true).sort(), ['@/lib/client', '@/lib/lazy', '@/styles/x.css']);
  // Outside pages nothing is stripped: a module counts whole once imported.
  assert.deepEqual(clientImports('lib/x.ts', page, false).sort(),
    ['@/lib/client', '@/lib/lazy', '@/lib/serverHelper', '@/lib/serverOnly', '@/styles/x.css']);
  assert.deepEqual(clientImports('lib/y.ts', "export * from './a'; export { b } from './b'; export type { C } from './c';", false), ['./a', './b']);
});

test('client code bundles no data file whose asset pins the release does not own', () => {
  const reached = clientDataFiles();
  // Not vacuous: the walk does reach client data. Only the few scripts/build/client-bundle-guard.cjs
  // allows are left (the schedule's banner fallback and the event calendar, which held pinned
  // Persona addresses, left client code for the page props: lib/content/tables.mjs).
  assert.ok(reached.has('data/assets/revisions.json'), [...reached.keys()].join('\n'));
  assert.equal(reached.has('data/skin-availability-windows.json'), false, 'timed windows belong to the content release');
  const problems: string[] = [];
  for (const [file, chain] of reached) {
    const pins = fs.readFileSync(path.join(ROOT, file), 'utf8').match(PINNED) ?? [];
    if (pins.length === 0) continue;
    const route = chain.join('\n    -> ');
    if (!CATALOGUE.some(pattern => pattern.test(file))) {
      problems.push(`${file} holds ${pins.length} commit-pinned asset address(es) (${pins[0]}) and reaches the client:\n    ${route}`);
      continue;
    }
    for (const pin of pins.filter(pin => !PINNED_ART.test(pin) && !VOICE.test(pin))) {
      problems.push(`${file}: contentUrl cannot re-pin ${pin}; reached via\n    ${route}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the crossover icon overrides stay out of client code', () => {
  // Pages take these operators' icons from their release records now. The table is
  // read only while a page's props are built (lib/gacha/gachaIconPools.ts).
  const chain = clientDataFiles().get('data/operator-icon-overrides.json');
  assert.equal(chain, undefined, `reached via ${chain?.join(' -> ')}`);
});
