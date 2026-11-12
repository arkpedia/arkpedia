import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PUBLIC_RECORDS, recordFiles } from '../content/records.mjs';
import { pinnedDataEntries } from '../content/pull-data.mjs';
import type { PollIndex } from '../../lib/polls/types';

/*
 * export.mjs publishes every data/** record into each release's source/, and
 * hydrate-source.mjs brings each one back into the next run. A record nothing reads is dead
 * weight that looks like data: data/events-data/ (71 files, 5,071 wiki.gg icon URLs, map
 * paths nothing serves) and data/stage_index.json were published daily for months with
 * their only mentions in two code comments, and data/stages.json, a wiki scrape nothing
 * rewrote, still fed the planner. These hold the data folder to what code reads, and to
 * sources that are not the wiki.
 */

// The records on disk, as pulled from arkpedia-data (npm run data:pull; pretest pulls them).
const tracked = recordFiles().filter(file => file.startsWith('data/'));

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
  'persona-collaboration-sources.json': 'where the Persona 3 collaboration records were checked, and when (hand-kept provenance)',
  'skin-catalogue-refresh-sources.json': 'per-outfit gallery and module citations, named in docs/pull-planner.md (hand-kept provenance)',
  'operator-import-report.json': 'the report scripts/imports/import-operator-details.ts writes for a person to review',
};

/* Records another project reads, not the site: arkpedia-data publishes them for it. They may land
   in the data before or after a change here, so an absent one is not a stale entry. */
const READ_ELSEWHERE: Record<string, string> = {
  'simulator': "the stage simulator's raw enemy tables and their receipt, which arkpedia-stage-simulator reads from arkpedia-data",
  // Read by arkpedia-data's import (its importer/), the next night's run, and by no site code.
  'client-art-shadow.json': "shadow-client-art.py's comparison of the client's sprites with the published icons, which it reads back",
  'official-tables-shadow.json': "shadow-official-tables.py's comparison of the official servers' tables with the mirrors', which it reads back",
  'excluded-contents.json': 'the modes the stage build leaves out (build-mode-exclusions.mjs), for the stage index, renders and coverage',
  'namecard-styles.json': "the profile card themes' colours, which build-game-account-map.ts carries to the account map",
  'stage-conditional': "the stage build's conditional-level records (stage-pipeline/build.mjs)",
  'stage-coverage.json': "check-stage-coverage.mjs's record of which stages the site lists, the import's stage-coverage invariant",
};

test('every top-level record in data/ is read by code, or is a named record kept for people', () => {
  const text = ['lib', 'pages', 'components', 'scripts', 'config'].flatMap(readers).map(code).join('\n');
  const entries = [...new Set(tracked.map(file => file.split('/')[1]))].sort();
  const unread = entries.filter(entry => {
    if (entry in READ_BY_PEOPLE || entry in READ_ELSEWHERE) return false;
    const folder = tracked.some(file => file.startsWith(`data/${entry}/`));
    if (folder) return !(text.includes(`data/${entry}`) || text.includes(`'${entry}'`) || text.includes(`"${entry}"`));
    // The whole file name, not the tail of another: 'stages.json' is not read by a mention
    // of 'supply-stages.json'.
    const name = new RegExp(`(?<![\\w.-])${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
    return !name.test(text);
  });
  // A record the live data has and the pinned spec data does not is arriving: the data lands
  // first and its code follows (README), so it fails nothing until the pin moves past it, and
  // the pull request that moves the pin gives it a reader. Unreadable pin: every record counts.
  const pinned = pinnedDataEntries();
  const arriving = pinned ? unread.filter(entry => !pinned.has(entry)) : [];
  if (arriving.length) console.log(`Arriving in the live data, not in the pinned spec data, and read by no code yet: ${arriving.join(', ')}`);
  assert.deepEqual(unread.filter(entry => !arriving.includes(entry)), [], 'published in every release, but no code reads it: retire it (hydrate-source.mjs deprecatedSourceFiles) or give it a reader');
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

/* The app keeps no records of its own (2026-10-29): data/ and the public records are pulled from
   arkpedia-data, never committed. A record committed here would be a second copy that falls
   behind, as the 91 MB bundle did, and that the release job silently replaces. */
test('no record is committed here, and .gitignore keeps every pulled record out', () => {
  const committed = execFileSync('git', ['ls-files', '-z', 'data', ...PUBLIC_RECORDS, 'public/operator-search.json'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(committed, [], 'records belong in arkpedia-data; run git rm --cached on them');
  const ignore = fs.readFileSync('.gitignore', 'utf8').split('\n').map(line => line.trim());
  for (const pattern of ['/data/', ...PUBLIC_RECORDS.map(file => `/${file}`), '/public/operator-search.json']) {
    assert.ok(ignore.includes(pattern), `.gitignore must list ${pattern}`);
  }
});

/* Every published poll shares one envelope (lib/polls/types.ts), and the index lists each one. */
test('the poll index and every poll result file have the published envelope', () => {
  const index: PollIndex = JSON.parse(fs.readFileSync('data/polls/index.json', 'utf8'));
  assert.equal(index.schema, 1);
  assert.ok(Array.isArray(index.polls) && index.polls.length > 0);
  const day = /^\d{4}-\d{2}-\d{2}$/;
  for (const poll of index.polls) {
    assert.match(poll.id, /^[a-z0-9-]+-v\d+\.\d+$/, `${poll.id}: ids are versioned, e.g. power-scale-v1.0`);
    assert.ok(['open', 'closed'].includes(poll.status), poll.id);
    assert.match(poll.opened, day, poll.id);
    if (poll.status === 'open') continue;
    assert.match(poll.closed ?? '', day, poll.id);
    assert.equal(poll.results, `data/polls/${poll.id}.json`, poll.id);
    const file = JSON.parse(fs.readFileSync(poll.results!, 'utf8'));
    for (const key of ['schema', 'id', 'kind', 'title', 'opened', 'closed', 'submissions', 'generatedAt', 'method', 'results']) {
      assert.ok(Object.hasOwn(file, key), `${poll.results} has no ${key}`);
    }
    assert.equal(file.schema, 1);
    assert.equal(file.id, poll.id);
    assert.equal(file.kind, poll.kind);
    assert.equal(file.submissions, poll.submissions);
    assert.ok(Array.isArray(file.method.exclusions), `${poll.results}: method.exclusions`);
  }
});
