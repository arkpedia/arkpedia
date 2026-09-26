import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/*
 * The games shipped a 198-line global stylesheet (styles/games/guesser.css) whose
 * classes nothing rendered, imported on every page of the site, and a module
 * (guesser.module.css) that defined five of its classes twice, so the second copy
 * silently won and the first was dead weight nobody could edit with confidence
 * (review finding GM-16). Neither is visible in the browser, and the style audit
 * only counts drift, not usage.
 *
 * This test holds every CSS module in the directories below to two rules:
 *   1. every class it defines is used by a file that imports it (as `styles.name`,
 *      `styles['name']`, or through `composes`), and
 *   2. no selector is written twice in the same context (top level or one @media).
 * A migration that deletes markup therefore has to delete its CSS too.
 *
 * Scope: the games and the operator pages (the page family migrated with this test).
 * Extend OWNED as other families' modules are cleaned; do not add a directory whose
 * modules have not been swept, or the suite fails for someone else's dead class.
 */
const ROOT = process.cwd();
const OWNED = ['styles/games', 'components/operators'];
const SOURCE_DIRS = ['pages', 'components', 'lib'];

function walk(dir: string, keep: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(full)) out.push(full);
  }
  return out;
}

/** Selector heads with the @-rule context each sits in, comments removed. */
function rules(css: string): { context: string; selector: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { context: string; selector: string }[] = [];
  const stack: string[] = [];
  let buffer = '';
  for (const ch of text) {
    if (ch === '{') {
      const head = buffer.trim();
      buffer = '';
      if (!head.startsWith('@')) out.push({ context: stack.filter((h) => h.startsWith('@')).join(' / '), selector: head.replace(/\s+/g, ' ') });
      stack.push(head);
    } else if (ch === '}') {
      stack.pop();
      buffer = '';
    } else if (ch === ';') {
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  return out;
}

/** Local class names a module defines (inside :global(...) is not local). */
function definedClasses(css: string): Set<string> {
  const names = new Set<string>();
  for (const { selector } of rules(css)) {
    if (/^(from|to|\d+%)/.test(selector)) continue; // keyframe steps
    const local = selector.replace(/:global\([^)]*\)/g, '');
    for (const m of local.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(m[1]);
  }
  return names;
}

/** Classes a module uses itself or hands to another module: `composes: a b;`,
 *  `composes: a from './x.module.css'` (a use of x's class). */
function composes(css: string): { local: string[]; external: { file: string; names: string[] }[] } {
  const local: string[] = [];
  const external: { file: string; names: string[] }[] = [];
  for (const m of css.matchAll(/composes\s*:\s*([^;]+);/g)) {
    const from = m[1].match(/^(.*?)\s+from\s+['"]([^'"]+)['"]\s*$/);
    if (from) external.push({ file: from[2], names: from[1].trim().split(/\s+/) });
    else local.push(...m[1].trim().split(/\s+/));
  }
  return { local, external };
}

function resolveImport(spec: string, fromFile: string): string {
  if (spec.startsWith('@/')) return path.join(ROOT, spec.slice(2));
  return path.resolve(path.dirname(fromFile), spec);
}

const modules = OWNED.flatMap((dir) => walk(path.join(ROOT, dir), (f) => f.endsWith('.module.css')));
const sources = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir), (f) => /\.(tsx?|jsx?)$/.test(f)));

/** module file -> the class names its importers use. */
function usage(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>(modules.map((m) => [m, new Set<string>()]));
  const note = (file: string, name: string) => used.get(file)?.add(name);
  for (const file of sources) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)) {
      const target = resolveImport(m[2], file);
      if (!used.has(target)) continue;
      const binding = m[1];
      for (const u of code.matchAll(new RegExp(`\\b${binding}\\.([_a-zA-Z][\\w]*)`, 'g'))) note(target, u[1]);
      for (const u of code.matchAll(new RegExp(`\\b${binding}\\[['"]([\\w-]+)['"]\\]`, 'g'))) note(target, u[1]);
      assert.ok(!new RegExp(`\\b${binding}\\[(?!['"])`).test(code),
        `${path.relative(ROOT, file)} reads ${binding}[...] with a computed key; this test cannot see which classes that uses. Use literal keys.`);
    }
  }
  for (const file of modules) {
    const css = fs.readFileSync(file, 'utf8');
    const { local, external } = composes(css);
    for (const name of local) note(file, name);
    for (const { file: spec, names } of external) for (const name of names) note(resolveImport(spec, file), name);
  }
  return used;
}

test('the owned directories hold CSS modules to check', () => {
  for (const dir of OWNED) {
    assert.ok(modules.some((m) => m.startsWith(path.join(ROOT, dir) + path.sep)), `no CSS module found under ${dir}`);
  }
});

test('every class a games or operator CSS module defines is used by its importers', () => {
  const used = usage();
  const dead: string[] = [];
  for (const file of modules) {
    const defined = definedClasses(fs.readFileSync(file, 'utf8'));
    for (const name of defined) if (!used.get(file)!.has(name)) dead.push(`${path.relative(ROOT, file)}: .${name}`);
  }
  assert.deepEqual(dead, [], 'Delete these rules (or the markup that should use them is missing):');
});

test('no games or operator CSS module writes the same selector twice in one context', () => {
  const twice: string[] = [];
  for (const file of modules) {
    const seen = new Map<string, number>();
    for (const { context, selector } of rules(fs.readFileSync(file, 'utf8'))) {
      if (/^(from|to|\d+%)/.test(selector)) continue;
      const key = `${context} :: ${selector}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, n] of seen) if (n > 1) twice.push(`${path.relative(ROOT, file)}: ${key} (x${n})`);
  }
  assert.deepEqual(twice, [], 'Merge these rules into one:');
});

test('no stylesheet imported by _app is a games stylesheet', () => {
  // The games style themselves through modules; a global games sheet loads on every
  // page of the site for four routes' benefit, and is how guesser.css went dead unseen.
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8');
  assert.equal(/import\s+['"]@\/styles\/games\//.test(app), false);
});

/*
 * The same rot in the global stylesheets, where there is no import to follow: the
 * operator page's operator-detail.css was 1,683 lines, of which 109 classes (six old
 * layouts: a sticky header with its own h1 rule, a swipe hint, a planner toast, a
 * thumbnail carousel) were rendered by nothing, and its CSS module still styled five of
 * them through :global(). A class is live when some page, component or lib file
 * names it -- literally, or as the fixed prefix of a template (`site-nav-clock-${x}`).
 *
 * Scope: the stylesheets of the pages migrated with this test (games, media,
 * community, the operator pages, skins, the nav). Extend it as other families' sheets
 * are swept.
 */
const OWNED_GLOBAL = [
  'styles/operators/operator-detail.css',
  'styles/operators/roster.css',
  'styles/music/music.css',
  'styles/skins/skins.css',
  'styles/community/community.css',
  'styles/community/video.css',
  'styles/maps/world.css',
  'styles/core/nav.css',
];

const sourceText = sources.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rendered(name: string): boolean {
  if (new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`).test(sourceText)) return true;
  const cut = name.lastIndexOf('-');
  return cut > 0 && sourceText.includes(`${name.slice(0, cut + 1)}\${`);
}

test('every class a migrated global stylesheet styles is rendered somewhere', () => {
  const dead: string[] = [];
  for (const file of OWNED_GLOBAL) {
    const names = new Set<string>();
    for (const { selector } of rules(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      if (/^(from|to|\d+%)/.test(selector)) continue;
      for (const m of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(m[1]);
    }
    for (const name of names) if (!rendered(name)) dead.push(`${file}: .${name}`);
  }
  assert.deepEqual(dead, [], 'Delete these rules (or the markup that should use them is missing):');
});

test('every class an owned CSS module reaches through :global() is rendered somewhere', () => {
  const dead: string[] = [];
  for (const file of modules) {
    for (const { selector } of rules(fs.readFileSync(file, 'utf8'))) {
      for (const g of selector.matchAll(/:global\(([^)]*)\)/g)) {
        for (const m of g[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!rendered(m[1])) dead.push(`${path.relative(ROOT, file)}: :global(.${m[1]})`);
      }
    }
  }
  assert.deepEqual([...new Set(dead)], [], 'Delete these selectors (the markup they styled is gone):');
});
