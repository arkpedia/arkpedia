import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/*
 * A class read from a CSS module that the module does not define is `undefined`, so the
 * element renders with no class at all: no type error, no lint warning, no build failure,
 * just paint missing on the page. It happened in a merge: main renamed the operator page's
 * skill-metric class to `skillMetricAmber` in the page and its module, while a branch
 * rewrote the module around the old `skillMetricManual`. Git merged the two cleanly and the
 * manual/offensive/defensive tiles lost their colour.
 *
 * This holds every `styles.name` and `styles['name']` a page, component or lib file reads
 * from an imported *.module.css (every module in the repository, unlike
 * test-module-css-usage.ts, which checks the other direction for the migrated families) to
 * a class that module defines, locally or through `composes`. Computed keys cannot be
 * checked here and are left alone.
 */
const ROOT = process.cwd();
const SOURCE_DIRS = ['pages', 'components', 'lib'];

function walk(dir: string, keep: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(full)) out.push(full);
  }
  return out;
}

/** Local class names a module defines or composes (inside :global(...) is not local). */
function definedClasses(css: string): Set<string> {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set<string>();
  let buffer = '';
  for (const ch of text) {
    if (ch === '{') {
      const head = buffer.trim();
      buffer = '';
      if (head.startsWith('@') || /^(from|to|\d+%)/.test(head)) continue;
      for (const m of head.replace(/:global\([^)]*\)/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(m[1]);
    } else if (ch === '}' || ch === ';') {
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  return names;
}

function resolveImport(spec: string, fromFile: string): string {
  if (spec.startsWith('@/')) return path.join(ROOT, spec.slice(2));
  return path.resolve(path.dirname(fromFile), spec);
}

/** Every literal class read from an imported CSS module, with where it is read. */
function references(): { file: string; module: string; name: string }[] {
  const out: { file: string; module: string; name: string }[] = [];
  const sources = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir), (f) => /\.(tsx?|jsx?)$/.test(f)));
  for (const file of sources) {
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Import lines out of the way first: `import x from '.../pulls-workspace.module.css'` is
    // not a read of `workspace.module`.
    const body = code.replace(/^\s*import\s[^;]*;/gm, '');
    for (const m of code.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)) {
      const module = resolveImport(m[2], file);
      const binding = m[1];
      const head = `(?<![\\w$.\\-/])${binding}`;
      for (const u of body.matchAll(new RegExp(`${head}\\.([_a-zA-Z]\\w*)`, 'g'))) out.push({ file, module, name: u[1] });
      for (const u of body.matchAll(new RegExp(`${head}\\[['"]([\\w-]+)['"]\\]`, 'g'))) out.push({ file, module, name: u[1] });
    }
  }
  return out;
}

test('pages read CSS module classes, so the check has something to hold', () => {
  assert.ok(references().length > 100);
});

test('every class read from a CSS module is defined in that module', () => {
  const defined = new Map<string, Set<string>>();
  const missing = new Set<string>();
  for (const { file, module, name } of references()) {
    if (!defined.has(module)) {
      assert.ok(fs.existsSync(module), `${path.relative(ROOT, file)} imports ${path.relative(ROOT, module)}, which does not exist`);
      defined.set(module, definedClasses(fs.readFileSync(module, 'utf8')));
    }
    if (!defined.get(module)!.has(name)) missing.add(`${path.relative(ROOT, file)}: ${name} (not in ${path.relative(ROOT, module)})`);
  }
  assert.deepEqual([...missing].sort(), [], 'each of these renders with no class, so its styles never apply: define the class or stop reading it');
});
