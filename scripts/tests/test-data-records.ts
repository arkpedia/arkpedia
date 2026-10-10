import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/*
 * export.mjs publishes every tracked data/**.json into each release's source/, and
 * hydrate-source.mjs brings each one back into the next run. A record nothing reads is dead
 * weight that looks like data: data/events-data/ (71 files, 5,071 wiki.gg icon URLs, map
 * paths nothing serves) and data/stage_index.json were published daily for months with
 * their only mentions in two code comments, and data/stages.json, a wiki scrape nothing
 * rewrote, still fed the planner. These hold the data folder to what code reads, and to
 * sources that are not the wiki.
 */

const tracked = execFileSync('git', ['ls-files', '-z', 'data'], { encoding: 'utf8' }).split('\0')
  .filter(file => file && fs.existsSync(file));

/** Code with its comments taken out, so a mention in a comment is not a reader. */
function code(file: string): string {
  const text = fs.readFileSync(file, 'utf8');
  if (/\.(py|sh)$/.test(file)) {
    return text.replace(/("""|''')[\s\S]*?\1/g, '').replace(/(^|\s)#.*$/gm, '$1');
  }
  // Block comments, then line comments that start a line or follow whitespace (so a
  // URL's // survives).
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function readers(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || at === path.join('scripts', 'tests') ? [] : readers(at);
    // Hydration and the export copy every record and name only the ones they retire.
    if (at === path.join('scripts', 'content', 'hydrate-source.mjs')) return [];
    return /\.(?:ts|tsx|mjs|cjs|js|py|sh)$/.test(entry.name) ? [at] : [];
  });
}

/*
 * Records kept for people rather than code, each with the reason. Everything else in data/
 * must have a reader. Add here only a record a person consults, never to quiet the test.
 */
const READ_BY_PEOPLE: Record<string, string> = {
  'README.md': 'the catalogue of this folder',
  'persona-collaboration-sources.json': 'where the Persona 3 collaboration records were checked, and when (hand-kept provenance)',
  'skin-catalogue-refresh-sources.json': 'per-outfit gallery and module citations, named in docs/pull-planner.md (hand-kept provenance)',
  'operator-import-report.json': 'the report scripts/imports/import-operator-details.ts writes for a person to review',
  'survey': 'the private raw poll export final-poll-results.json is aggregated from; never published',
};

test('every top-level record in data/ is read by code, or is a named record kept for people', () => {
  const text = ['lib', 'pages', 'components', 'scripts', 'config'].flatMap(readers).map(code).join('\n');
  const entries = [...new Set(tracked.map(file => file.split('/')[1]))].sort();
  const unread = entries.filter(entry => {
    if (entry in READ_BY_PEOPLE) return false;
    const folder = tracked.some(file => file.startsWith(`data/${entry}/`));
    if (folder) return !(text.includes(`data/${entry}`) || text.includes(`'${entry}'`) || text.includes(`"${entry}"`));
    // The whole file name, not the tail of another: 'stages.json' is not read by a mention
    // of 'supply-stages.json'.
    const name = new RegExp(`(?<![\\w.-])${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
    return !name.test(text);
  });
  assert.deepEqual(unread, [], 'published in every release, but no code reads it: retire it (hydrate-source.mjs deprecatedSourceFiles) or give it a reader');
  // An allowlisted record that is gone is a stale entry.
  for (const entry of Object.keys(READ_BY_PEOPLE)) {
    assert.ok(tracked.some(file => file === `data/${entry}` || file.startsWith(`data/${entry}/`)), `data/${entry} is no longer here; take it out of READ_BY_PEOPLE`);
  }
});

/*
 * arknights.wiki.gg is a citation, never a data source. A URL of it may appear only in a
 * field that cites where a hand-kept fact was checked.
 */
const CITATION_FIELDS = new Set(['inventorySource', 'gallery', 'module', 'wiki', 'source', 'sources', 'sourceRef']);

test('no released record carries a wiki.gg URL outside a citation field', () => {
  const offenders: string[] = [];
  const walk = (value: unknown, file: string, key: string, trail: string) => {
    if (typeof value === 'string') {
      if (/wiki\.gg/i.test(value) && !CITATION_FIELDS.has(key)) offenders.push(`${file} ${trail}`);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, file, key, `${trail}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, file, k, `${trail}.${k}`);
    }
  };
  for (const file of tracked.filter(f => f.endsWith('.json'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/wiki\.gg/i.test(text)) continue;
    walk(JSON.parse(text), file, '', '');
  }
  for (const file of fs.readdirSync('public').filter(f => f.endsWith('.json'))) {
    const text = fs.readFileSync(path.join('public', file), 'utf8');
    if (/wiki\.gg/i.test(text)) walk(JSON.parse(text), `public/${file}`, '', '');
  }
  assert.deepEqual(offenders.slice(0, 20), [], `${offenders.length} wiki.gg URL(s) in data fields, not citations`);
});
