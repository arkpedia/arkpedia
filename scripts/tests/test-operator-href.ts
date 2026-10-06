import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { OPERATOR_SECTIONS, isOperatorSection, operatorHref } from '../../lib/operators/operatorHref';

const root = join(__dirname, '..', '..');

test('moving to another operator keeps the section the reader is on; the overview and the artwork are the page top', () => {
  assert.equal(operatorHref('Texas', 'baseSkills'), '/operators/Texas#baseSkills');
  assert.equal(operatorHref('Ch\'en the Holungday', 'voiceLines'), "/operators/Ch'en%20the%20Holungday#voiceLines");
  assert.equal(operatorHref('Texas', 'overview'), '/operators/Texas');
  assert.equal(operatorHref('Texas', 'artwork'), '/operators/Texas');
  assert.equal(operatorHref('Texas', null), '/operators/Texas');
});

test('a section read off the page is one only when the page has a name for it', () => {
  for (const section of ['overview', 'artwork', 'skills', 'talents', 'baseSkills', 'synergy', 'voiceLines']) {
    assert.ok(isOperatorSection(section), section);
  }
  // A misspelling, a different case, the view aliases the page resolves itself (jumpToSection
  // turns #appearance into the artwork, #gameplay into the skills), and an empty hash.
  for (const value of ['baseSkill', 'Skills', 'gameplay', 'appearance', '']) assert.ok(!isOperatorSection(value), JSON.stringify(value));
});

/** Every source file under `dirs` the scans below read, as a path from the repository root. */
function sourceFiles(...dirs: string[]): string[] {
  // Paths as strings: Dirent.parentPath is newer than the Node 20 package.json allows.
  return dirs.flatMap(dir => (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter(rel => /\.(?:tsx?|jsx?|mjs)$/.test(rel))
    .map(rel => join(dir, rel)));
}

/* The page's highlight comes from the attribute: its scroll handler reads data-operator-section
   off the section under the header and keeps it only if isOperatorSection says the page has a
   name for it. A section added with a name the list lacks never lights up in "Jump to section"
   and drops out of the section kept on the next operator; a name the list has that no element
   carries is one a link can write and nothing answers ('appearance', a hash alias, sat in the
   list that way). And jumpToSection finds the element by id, operator-<name>, so the two must
   agree or a jump lands nowhere. */
test('the operator page\'s sections and OPERATOR_SECTIONS are the same names, each on the element its id names', () => {
  const attributes: { at: string; name: string; line: string }[] = [];
  const dynamic: string[] = [];
  for (const file of sourceFiles('pages', 'components')) {
    readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/data-operator-section="([^"]*)"/g)) attributes.push({ at: `${file}:${i + 1}`, name: m[1], line });
      // A computed name would pass by this scan unread.
      if (/data-operator-section=\{/.test(line)) dynamic.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(dynamic, [], 'write data-operator-section as a literal, so this test can read it');
  assert.ok(attributes.length >= 10, `the scan found ${attributes.length} sections`);
  const names = attributes.map(({ name }) => name);
  assert.deepEqual(attributes.filter(({ name }) => !isOperatorSection(name)).map(({ at, name }) => `${at} ${name}`), [],
    'add the section to OPERATOR_SECTIONS in lib/operators/operatorHref.ts');
  // The artwork is the one place with no attribute: the page's top, highlighted by its own rule
  // on a phone, found by its id.
  assert.deepEqual(OPERATOR_SECTIONS.filter(name => name !== 'artwork' && !names.includes(name)), [],
    'a name in OPERATOR_SECTIONS that no element carries');
  assert.deepEqual(attributes.filter(({ name, line }) => !line.includes(`id="operator-${name}"`)).map(({ at, name }) => `${at} ${name}`), [],
    'give the section id="operator-<its name>" on the same element');
  assert.match(readFileSync(join(root, 'pages', 'operators', '[name].tsx'), 'utf8'), /id="operator-artwork"/);
});

/**
 * Whether a line of source builds an operator's URL itself: a template that fills the name in
 * (`/operators/${name}`, `/operators/${encodeURIComponent(name)}`) or a string that ends at the
 * slash and is added to ('/operators/' + encodeURIComponent(name)). The route pattern
 * '/operators/[name]' -- getStaticProps' and contentRoute's -- and a module path such as
 * '@/lib/operators/operatorHref' are neither.
 */
function buildsOperatorUrl(line: string): boolean {
  return /\/operators\/\$\{/.test(line) || /\/operators\/['"`]\s*\+/.test(line);
}

test('the hand-built operator URL check sees each way of writing one, and not the route or an import', () => {
  for (const line of [
    'href={`/operators/${encodeURIComponent(op.name)}`}',
    'href={`/operators/${slug}#skills`}',
    "router.push('/operators/' + encodeURIComponent(name))",
    'const url = "/operators/" + name;',
    'const url = `/operators/` + name;',
  ]) assert.ok(buildsOperatorUrl(line), line);
  for (const line of [
    "withContentPage<Props>('/operators/[name]', async ({ params }) => {",
    'contentRoute("/operators/[name]", { name })',
    "import { operatorHref } from '@/lib/operators/operatorHref';",
    "href={operatorHref(op.name, null)}",
    "href=\"/operators\"",
  ]) assert.ok(!buildsOperatorUrl(line), line);
});

/* operatorHref is the one place an operator's URL is built. A link that builds its own
   cannot keep the reader's section, which is how four operator-to-operator links on the
   operator page (Amiya's forms, the synergy lists) kept dropping readers at the top of the
   next page after the rest had moved over. A link from elsewhere passes null. */
test('no page, component or other library module builds an operator URL by hand', () => {
  const builder = join('lib', 'operators', 'operatorHref.ts');
  const offenders: string[] = [];
  for (const file of sourceFiles('pages', 'components', 'lib')) {
    if (file === builder) continue;
    readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
      if (buildsOperatorUrl(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  // Not vacuous: the builder itself is what the check refuses anywhere else.
  assert.ok(readFileSync(join(root, builder), 'utf8').split('\n').some(buildsOperatorUrl), 'operatorHref builds the URL');
  assert.deepEqual(offenders, [], 'build the link with operatorHref(name, section) from lib/operators/operatorHref.ts');
});
