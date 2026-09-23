import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import eventRewards from '../../data/pull-event-rewards.json';
import { bannerHaul, remainingBacklog, type BacklogSources } from '../../lib/pulls/pulls';
import { resolvePullEventSchedule } from '../../lib/pulls/schedule';
import type { getAllEvents } from '../../lib/schedule/schedule';

/*
 * The pull planner once imported data/pull-sources.json into the browser. The
 * page's schedule came from the live content release, the back catalogue from
 * whatever the last deploy compiled in, so a Global event the release already
 * listed as playable ('People, A People', 27 OP) was skipped by one and never
 * counted by the other until somebody redeployed. The browser must only ever see
 * the release's copy, which the page gets through getStaticProps.
 */
const ROOT = process.cwd();
const BUNDLED = ['data/pull-sources.json', 'data/pull-first-clears.json'];
/* Next strips these from the browser build, and with them every import and
   declaration nothing else still uses. */
const SERVER_EXPORTS = new Set(['getStaticProps', 'getStaticPaths', 'getServerSideProps']);

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  const found = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
    .find(file => fs.existsSync(file) && fs.statSync(file).isFile());
  return found ? path.relative(ROOT, found) : null;
}

/** Identifiers a statement refers to. Property names are not references. */
function references(node: ts.Node, into = new Set<string>()): Set<string> {
  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    const propertyName = parent && ((ts.isPropertyAccessExpression(parent) && parent.name === node)
      || ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)
      || (ts.isJsxAttribute(parent) && parent.name === node));
    if (!propertyName) into.add(node.text);
  }
  node.forEachChild(child => { references(child, into); });
  return into;
}

function declared(statement: ts.Statement): string[] {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) return [statement.name.text];
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(d => ts.isIdentifier(d.name) ? [d.name.text] : []);
  return [];
}

const exported = (statement: ts.Statement) => ts.canHaveModifiers(statement)
  && !!ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);

/** What a page keeps once Next removes its data-fetching exports, and then any
 *  declaration only they used. Everything else in a module is kept. */
function browserStatements(statements: ts.Statement[]): ts.Statement[] {
  const refs = new Map(statements.map(s => [s, references(s)]));
  const removed = new Set(statements.filter(s => exported(s) && declared(s).some(name => SERVER_EXPORTS.has(name))));
  for (let changed = true; changed;) {
    changed = false;
    for (const s of statements) {
      const names = declared(s);
      if (removed.has(s) || exported(s) || !names.length) continue;
      const usedBy = (others: ts.Statement[]) => others.some(other => other !== s && names.some(name => refs.get(other)!.has(name)));
      if (usedBy([...removed]) && !usedBy(statements.filter(other => !removed.has(other)))) { removed.add(s); changed = true; }
    }
  }
  return statements.filter(s => !removed.has(s));
}

/** Modules this file loads in the browser: every value import still used, plus
 *  import('…') and new URL('…', import.meta.url) workers. */
function browserImports(file: string, isPage: boolean): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const body = source.statements.filter(s => !ts.isImportDeclaration(s));
  const kept = isPage ? browserStatements(body) : body;
  const live = new Set<string>();
  for (const s of kept) references(s, live);
  const specs: string[] = [];
  for (const s of source.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const clause = s.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      const names = [
        ...(clause?.name ? [clause.name.text] : []),
        ...(bindings && ts.isNamespaceImport(bindings) ? [bindings.name.text] : []),
        ...(bindings && ts.isNamedImports(bindings) ? bindings.elements.filter(e => !e.isTypeOnly).map(e => e.name.text) : []),
      ];
      if (!clause || names.some(name => !isPage || live.has(name))) specs.push(s.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(s) && !s.isTypeOnly && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) specs.push(s.moduleSpecifier.text);
  }
  const visit = (node: ts.Node) => {
    if ((ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      || (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL')) {
      const [first] = node.arguments ?? [];
      if (first && ts.isStringLiteral(first)) specs.push(first.text);
    }
    node.forEachChild(visit);
  };
  kept.forEach(visit);
  return specs.map(spec => resolve(file, spec)).filter((resolved): resolved is string => !!resolved);
}

/** The chain from `entry` to the first bundled pull file it reaches, if any. */
function pathToBundled(entry: string, clientOnly = true): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (BUNDLED.includes(file)) {
      const chain = [file];
      for (let at = parent.get(file); at; at = parent.get(at)) chain.unshift(at);
      return chain;
    }
    if (!/\.(tsx?|mjs|js)$/.test(file)) continue;
    for (const next of browserImports(file, file === entry && clientOnly)) {
      if (!parent.has(next)) { parent.set(next, file); queue.push(next); }
    }
  }
  return null;
}

function pages(dir = 'pages'): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return file === path.join('pages', 'api') ? [] : pages(file);
    return /\.tsx?$/.test(entry.name) && entry.name !== '_document.tsx' ? [file] : [];
  });
}

test('no page ships the bundled pull data to the browser', () => {
  const all = pages();
  assert.ok(all.includes('pages/pulls.tsx'));
  // The walk is not vacuous: the server half of /pulls does reach the bundled
  // data, through getStaticProps, and the browser half reaches the planner code.
  assert.deepEqual(pathToBundled('pages/pulls.tsx', false)?.at(-1)?.startsWith('data/pull-'), true);
  assert.ok(browserImports('pages/pulls.tsx', true).includes('components/pulls/PastRewards.tsx'));
  assert.ok(browserImports('pages/pulls.tsx', true).includes('lib/pulls/pulls.ts'));
  assert.ok(!browserImports('pages/pulls.tsx', true).includes('lib/pulls/sources.ts'));
  const leaks = all.flatMap(page => { const chain = pathToBundled(page); return chain ? [chain.join(' -> ')] : []; });
  assert.deepEqual(leaks, [], 'Browser code must read the back catalogue from the page props (BacklogSources), which carry the content release, not from data/.');
});

/** The release's back catalogue with one event the deployed bundle has never heard of. */
function withReleaseOnly(bundled: BacklogSources, event: { id: string; name: string; op: number }): BacklogSources {
  assert.ok(!bundled.playable.some(known => known.id === event.id || known.name === event.name));
  return { ...bundled, playable: [...bundled.playable, event] };
}

/* A made-up back catalogue and calendar. The live ones change with every refresh:
   the day the last scheduled event that pays Originite joins the back catalogue,
   a test that looked one up in them would fail the release. */
const bundled: BacklogSources = {
  chapters: [{ id: 'main_01', label: 'Episode 01', name: 'Chapter', op: 20 }],
  originiteByStageType: { daily: 12, main: 99, activity: 99 },
  annihilationOrundum: 1800,
  playable: [{ id: 'act_old', name: 'Old Event', op: 24 }],
  resources: [{ id: 'wk_melee_1', name: 'Tough Siege', amount: 2 }],
  annihilation: [{ id: 'camp_r_01', name: 'Chernobog', amount: 400 }],
};
// resolvePullEventSchedule reads the rewards file itself; any event in it that pays
// Originite will do, given a window of its own.
const reward = eventRewards.find(event => event.op > 0 && !/rerun/i.test(event.event));

test('an event only the content release lists is counted, once', () => {
  const none = new Set<string>();
  const release = withReleaseOnly(bundled, { id: 'act_release_only', name: 'Release Only', op: 27 });
  assert.equal(remainingBacklog(release, none, none, false).originitePrime, remainingBacklog(bundled, none, none, false).originitePrime + 27);
  assert.equal(remainingBacklog(release, new Set(['act_release_only']), none, false).originitePrime, remainingBacklog(bundled, none, none, false).originitePrime);

  /* The schedule marks it inBacklog from the SAME object, so bannerHaul hands it
     over to the back catalogue rather than losing it between the two. */
  assert.ok(reward, 'data/pull-event-rewards.json lists an event that pays Originite');
  const events = [{ name: reward.event, global: { dateRange: '2030/01/01–2030/01/15' } }] as unknown as ReturnType<typeof getAllEvents>;
  const before = resolvePullEventSchedule(events, bundled);
  const target = before.find(event => event.name === reward.event);
  assert.ok(target && target.op > 0 && !target.inBacklog && !target.rerun);
  const moved = withReleaseOnly(bundled, { id: 'act_release_only', name: target.event!, op: target.op });
  const after = resolvePullEventSchedule(events, moved);
  assert.equal(after.find(event => event.name === target.name)?.inBacklog, true);
  const farFuture = new Date('2099-12-31T23:59:59Z');
  const counted = (sources: BacklogSources, schedule: typeof before) =>
    bannerHaul(schedule, farFuture, { cleared: none }).op + remainingBacklog(sources, none, none, false).originitePrime;
  assert.equal(counted(moved, after), counted(bundled, before));
  assert.equal(bannerHaul(after, farFuture, { cleared: none }).op, bannerHaul(before, farFuture, { cleared: none }).op - target.op);
});
