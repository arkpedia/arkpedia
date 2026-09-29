import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getBannerOdds, LIMITED_RULES, ODDS_RULES, rulesKindFor, unverifiedBanners } from '../../lib/pulls/bannerOdds';
import { getPullSchedule } from '../../lib/pulls/schedule';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';

/*
 * The pull planner's verified rules are a game record, data/pull-odds-rules.json, kept by
 * hand in arkpedia-data so a new banner's rules need no redeploy (lib/pulls/bannerOdds.ts).
 * These hold the record's shape, and the odds-rules stage's finding: a scheduled limited,
 * crossover or Orienteering banner without rules is named, never silently oddless.
 */
const PREFIX = { limited: 'LIMITED_', crossover: 'LINKAGE_', orienteering: 'SPECIAL_' } as const;

test('every verified pool is filed under its kind, with its announcement and banner name', () => {
  assert.equal(ODDS_RULES.version, 1);
  const pools = new Set(getAllHeadhuntingBanners().map((banner) => banner.cnPoolId).filter(Boolean));
  for (const kind of ['limited', 'crossover', 'orienteering'] as const) {
    for (const [id, pool] of Object.entries(ODDS_RULES[kind])) {
      assert.ok(id.startsWith(PREFIX[kind]), `${id} is filed under ${kind}`);
      assert.match(pool.source, /^https:\/\/ak\.hypergryph\.com\/news\/\d+(\.html)?$/, `${id}'s source is its official announcement`);
      assert.ok(pool.name.trim(), `${id} names its banner, for whoever edits the file next`);
      assert.ok(pools.has(id), `${id} is a pool the banner list has`);
    }
  }
  for (const [id, pool] of Object.entries(ODDS_RULES.limited)) {
    for (const charId of [pool.bonus, ...pool.returning300, ...pool.returning200]) assert.match(charId, /^char_\d+_\w+$/, `${id}: ${charId}`);
  }
});

test('the file is a seeded source record, so it reaches arkpedia-data and is edited there', () => {
  assert.match(fs.readFileSync('scripts/content/hydrate-source.mjs', 'utf8'), /'data\/pull-odds-rules\.json'/);
  assert.match(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8'), /stage odds-rules -- npx tsx scripts\/content\/check-pull-odds\.ts/);
});

test('a pool needs rules by its id: LIMITED_, LINKAGE_ and an Orienteering SPECIAL_', () => {
  assert.equal(rulesKindFor('LIMITED_73_0_1', '[Celebration] Sealed With Time'), 'limited');
  // Persona 3 Reload's banner record says pull_type "limited"; its pool is a crossover's.
  assert.equal(rulesKindFor('LINKAGE_77_0_1', '[Crossover · Persona 3 Reload] Some Evening of White and Mystic Blue'), 'crossover');
  assert.equal(rulesKindFor('SPECIAL_77_0_4', 'Orienteering #8'), 'orienteering');
  assert.equal(rulesKindFor('SPECIAL_60_0_1', 'Joint Operation'), null, 'no model to verify rules for');
  assert.equal(rulesKindFor('SINGLE_72_0_1', 'Rage of The Many'), null, 'single-featured rules are one for all');
  assert.equal(rulesKindFor(null, 'Kernel #62 (Global)'), null);
});

test('a scheduled banner without verified rules is named with why, and a verified one is not', () => {
  const schedule = getPullSchedule();
  const odds = getBannerOdds(schedule);
  const persona = schedule.find((banner) => banner.poolId === 'LINKAGE_77_0_1');
  assert.ok(persona && odds[persona.name], 'the Persona 3 Reload crossover is verified');
  const kernel = schedule.find((banner) => !banner.poolId);
  // A crossover nobody has read yet, a limited banner whose rules name a character no
  // operator record has, and the ones that need nothing.
  const unread = { ...persona, name: 'An Unread Crossover', poolId: 'LINKAGE_99_0_1' };
  const broken = { ...persona, name: 'A Limited With A Typo', poolId: 'LIMITED_99_0_1' };
  LIMITED_RULES.LIMITED_99_0_1 = { name: broken.name, source: 'https://ak.hypergryph.com/news/1', bonus: 'char_9999_nobody', returning300: [], returning200: [] };
  try {
    const found = unverifiedBanners([persona, ...(kernel ? [kernel] : []), unread, broken], odds);
    assert.deepEqual(found.map(({ banner, kind }) => [banner.name, kind]), [['An Unread Crossover', 'crossover'], ['A Limited With A Typo', 'limited']]);
    assert.match(found[0].reason, /without odds until someone reads its announcement and adds its rules under "crossover" in data\/pull-odds-rules\.json/);
    assert.match(found[1].reason, /name char_9999_nobody, which no operator record has/);
  } finally {
    delete LIMITED_RULES.LIMITED_99_0_1;
  }
});
