import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

/*
 * "Coming soon" placeholders stay hidden until they have content (the 2026-09-25
 * decision). The home page's Packs panel, an event page's Packs and Miscellaneous tabs
 * and /gacha's tutorial fallback each said only that, and each was found by reading
 * the rendered page, not by any check. This fails when one comes back.
 *
 * It reads the code the reader can be shown: every .tsx under pages/ and components/,
 * with comments removed, so a comment that explains why a placeholder went is fine.
 *
 * ALLOWED lists the placeholders still on the site, owned by pages another migration
 * covers. It is a ratchet: a new one fails, and so does a count that has dropped, so
 * lower the number (or delete the line) in the commit that removes one.
 */
const ALLOWED: Record<string, number> = {
  'pages/community.tsx': 2,     // Art and Cosplayer panels
  'pages/music/index.tsx': 1,   // "Playlists are coming soon!"
};

const PLACEHOLDER = /coming soon/gi;
const root = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...walk(path));
    else if (name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** The file without its comments: block comments (JSX {/* ... *\/} included) and line
 *  comments, but not the // inside a URL or a string. */
function code(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

test('no page or component shows a "Coming soon" placeholder', () => {
  const found: Record<string, number> = {};
  for (const path of [...walk('pages'), ...walk('components')]) {
    const n = [...code(readFileSync(join(root, path), 'utf8')).matchAll(PLACEHOLDER)].length;
    if (n > 0) found[relative('.', path).split('\\').join('/')] = n;
  }

  const added = Object.entries(found)
    .filter(([path, n]) => n > (ALLOWED[path] ?? 0))
    .map(([path, n]) => `${path}: ${n} (allowed ${ALLOWED[path] ?? 0})`);
  assert.deepEqual(added, [], 'hide a placeholder until it has content instead of shipping "Coming soon"');

  const stale = Object.entries(ALLOWED)
    .filter(([path, n]) => (found[path] ?? 0) < n)
    .map(([path, n]) => `${path}: allowed ${n}, now ${found[path] ?? 0}`);
  assert.deepEqual(stale, [], 'a placeholder was removed: lower its count in ALLOWED so it cannot come back');
});
