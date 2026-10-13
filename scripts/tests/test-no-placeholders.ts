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
 * The last panels (/community's Art and Cosplayer panels and /music's playlists note) went
 * with the media and community migration. Hide a panel until it has content instead of
 * adding a line here. The one exception is not a panel: the selector guide's beginner and
 * gifted tickets, whose How to Use videos Kukki is recording, say "Coming soon" on the line
 * under a portrait that has no video yet, beside the ones that do (asked for by the user,
 * 2026-10-13; the tickets are lib/selectors/videosComingSoon.ts).
 */
const ALLOWED: Record<string, number> = { 'components/events/RewardDetails.tsx': 1 };

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
