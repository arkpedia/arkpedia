import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/* A tab's sessionStorage, fresh per test. */
function tab() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } };
}

test('Back goes to the page before, not to the section before, and returning drops the page left', async () => {
  tab();
  const { recordPage, previousPage } = await import('../../lib/nav/pageTrail');
  recordPage('/operators');
  assert.equal(previousPage(), null, 'the first page in a tab has none');
  recordPage('/operators/Texas');
  recordPage('/operators/Texas#baseSkills'); // a section jump is the same page
  assert.equal(previousPage(), '/operators');
  recordPage('/operators/Exusiai#baseSkills'); // operator to operator, by the search
  assert.equal(previousPage(), '/operators/Texas');
  recordPage('/operators/Texas'); // Back (or the browser's): the page left is dropped
  assert.equal(previousPage(), '/operators', 'not Exusiai again: Back from Texas still reaches the roster');
  recordPage('/operators');
  assert.equal(previousPage(), null);
});

test('a new query on the same path is the same page, and a reload records nothing new', async () => {
  tab();
  const { recordPage, previousPage } = await import('../../lib/nav/pageTrail');
  recordPage('/schedule');
  recordPage('/stages/browse?s=ta-1');
  recordPage('/stages/browse?s=ta-2');
  recordPage('/stages/browse?s=ta-2');
  assert.equal(previousPage(), '/schedule');
  recordPage('/events/X');
  assert.equal(previousPage(), '/stages/browse?s=ta-2', 'Back reaches the stage that was open');
});

/* A page's Back is placed by the header it sits in -- .page-header > .back-btn gives it the
   room under it and its own width in the operator page's grid -- so BackLink reaches a page
   only through PageHeader's `back`, which always draws that class. The optimizers each drew
   a bare <header> around their own BackLink, and the rule had to match every <header> on
   the site (a dialog's title bar among them) to place theirs. */
test('BackLink is imported by PageHeader alone, so every page Back sits in a .page-header', () => {
  const root = join(__dirname, '..', '..');
  const importers: string[] = [];
  for (const dir of ['pages', 'components', 'lib']) {
    // Paths as strings: Dirent.parentPath is newer than the Node 20 package.json allows.
    for (const rel of readdirSync(join(root, dir), { recursive: true }) as string[]) {
      if (!/\.(?:tsx?|jsx?|mjs)$/.test(rel)) continue;
      const path = join(root, dir, rel);
      // An import or a dynamic import of the module, by any path; a comment naming it is not one.
      if (/\bfrom\s+['"][^'"]*\/BackLink['"]|\bimport\(\s*['"][^'"]*\/BackLink['"]/.test(readFileSync(path, 'utf8'))) {
        importers.push(relative(root, path));
      }
    }
  }
  assert.deepEqual(importers, ['components/ui/PageHeader.tsx'], 'give the page its Back with <PageHeader back={{ href, label }} />');
});
