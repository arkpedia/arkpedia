import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * A long list grows as it is read (components/ui/LoadOnScroll.tsx), not behind a "Show
 * more" button. /skins grew that way while /community/videos, /operators, both stage
 * lists, the two music lists, /schedule's All Skins and the planner's outfit shop each
 * still had a button that added a page to a count. These hold every list to the one loader.
 */
function tsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? tsx(file) : file.endsWith('.tsx') ? [file] : [];
  });
}
const sources = [...tsx('pages'), ...tsx('components')].map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

test('no list grows behind a button that adds a page to its count', () => {
  // `onClick={() => setShown((n) => n + PAGE)}`: a click that adds a batch. Adding 1 (a
  // guide's next page, a retry) is a step, not a batch.
  const batch = /onClick=\{\(\)\s*=>\s*set\w+\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\s*\+\s*(?!1\b)(?:[A-Z][A-Z0-9_]*|\d+)\s*\)\s*\}/;
  const hits = sources.filter(({ text }) => batch.test(text)).map(({ file }) => file);
  assert.deepEqual(hits, [], 'grow the list with <LoadOnScroll shown total onMore /> instead');
});

test('no button offers to show more of a list', () => {
  const label = /<button\b[^>]*>(?:(?!<\/button>)[\s\S]){0,200}?\b(?:Show|Load|See|View)\b(?:(?!<\/button>)[^<{]){0,40}(?:\{[^}]*\}\s*)?(?:more|everything|remaining)\b/i;
  const hits = sources.filter(({ text }) => label.test(text)).map(({ file }) => file);
  assert.deepEqual(hits, [], 'grow the list with <LoadOnScroll shown total onMore /> instead');
});

test('lists watch the reader through the one loader', () => {
  // A list with its own IntersectionObserver is how /skins' copy came to differ from every
  // other list's button. The image-arrival hold watches images, not a list.
  const own = sources.filter(({ file, text }) => /new IntersectionObserver\b/.test(text) && file !== path.join('components', 'ui', 'LoadOnScroll.tsx'));
  assert.deepEqual(own.map(({ file }) => file), []);
  const users = sources.filter(({ text }) => /<LoadOnScroll\b/.test(text)).map(({ file }) => file);
  assert.ok(users.length >= 9, `the lists use the loader (${users.join(', ')})`);
});
