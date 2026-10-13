import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { howToUseVideoId } from '../../lib/selectors/howToUse';

test('a selector portrait takes the first kukkikaze guide, whatever its place or casing, or none', () => {
  assert.equal(howToUseVideoId({ guides: [{ videoId: 'aaaaaaaaaaa', creator: 'FrostByte262' }, { videoId: 'S0zeA3uXINI', creator: 'kukkikaze' }] }), 'S0zeA3uXINI');
  assert.equal(howToUseVideoId({ guides: [{ videoId: 'FhmRwxE-w8o', creator: ' Kukkikaze ' }, { videoId: 'bbbbbbbbbbb', creator: 'kukkikaze' }] }), 'FhmRwxE-w8o');
  assert.equal(howToUseVideoId({ guides: [{ videoId: 'ccccccccccc', creator: 'Kay Sensei' }, { videoId: 'ddddddddddd' }] }), null);
  assert.equal(howToUseVideoId({ guides: [] }), null);
  assert.equal(howToUseVideoId({ guides: null }), null);
  assert.equal(howToUseVideoId({}), null);
});

test('the selector guide carries each operator\'s kukkikaze guide onto its ticket portrait', async () => {
  // DATA_DIR is read from the working directory when lib/operators loads, so the catalogue
  // runs in a mirror of the repository whose only difference is two fixture records.
  const repo = process.cwd();
  const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-howto-'));
  const fixtures: Record<string, { videoId: string; creator: string }[]> = {
    'Surtr.json': [{ videoId: 'QcSLaPXyyzw', creator: 'FrostByte262' }, { videoId: 'S0zeA3uXINI', creator: 'kukkikaze' }],
    'Mizuki.json': [{ videoId: 'Vt_w1G7_SBU', creator: 'FrostByte262' }],
  };
  try {
    for (const entry of fs.readdirSync(repo)) if (entry !== 'data') fs.symlinkSync(path.join(repo, entry), path.join(mirror, entry));
    fs.mkdirSync(path.join(mirror, 'data'));
    for (const entry of fs.readdirSync(path.join(repo, 'data'))) {
      if (entry !== 'operators-6star') fs.symlinkSync(path.join(repo, 'data', entry), path.join(mirror, 'data', entry));
    }
    const six = path.join(mirror, 'data', 'operators-6star');
    fs.mkdirSync(six);
    for (const file of fs.readdirSync(path.join(repo, 'data', 'operators-6star'))) {
      const source = path.join(repo, 'data', 'operators-6star', file);
      if (!fixtures[file]) { fs.symlinkSync(source, path.join(six, file)); continue; }
      fs.writeFileSync(path.join(six, file), JSON.stringify({ ...JSON.parse(fs.readFileSync(source, 'utf8')), guides: fixtures[file] }));
    }
    process.chdir(mirror);
    const { buildSelectorCatalogue } = await import('../../lib/selectors/catalogue');
    const { getAllOperators } = await import('../../lib/operators/operators');
    const { tickets } = buildSelectorCatalogue();
    const gifted = new Map(tickets['Special Event Transfer Permit'].operators.map(op => [op.name, op]));
    assert.equal(gifted.get('Surtr')?.howToUseVideoId, 'S0zeA3uXINI');
    assert.equal(gifted.get('Mizuki')?.howToUseVideoId, null, 'other creators\' guides are not How to Use links');
    // Every portrait in every ticket answers from its own record, and always says so (null, not absent).
    const records = new Map(getAllOperators().filter(op => op.rarity === 6).map(op => [op.name, op]));
    for (const op of Object.values(tickets).flatMap(ticket => ticket.operators)) {
      assert.ok('howToUseVideoId' in op, op.name);
      assert.equal(op.howToUseVideoId, howToUseVideoId(records.get(op.name)!), op.name);
    }
  } finally {
    process.chdir(repo);
    fs.rmSync(mirror, { recursive: true, force: true });
  }
});

test('the beginner and gifted selectors, whose videos Kukki is recording, say "Coming soon"; the others stay blank', async () => {
  const { VIDEOS_COMING_SOON } = await import('../../lib/selectors/videosComingSoon');
  const { buildSelectorCatalogue } = await import('../../lib/selectors/catalogue');
  const { cards } = buildSelectorCatalogue();
  assert.deepEqual([...VIDEOS_COMING_SOON].sort(), ['Special Event Transfer Permit', 'Top Operator Transfer Permit - Starter']);
  // Each name is a ticket the guide lists: a renamed ticket would silently lose its line.
  for (const name of VIDEOS_COMING_SOON) assert.ok(cards.some(card => card.name === name), name);
});
