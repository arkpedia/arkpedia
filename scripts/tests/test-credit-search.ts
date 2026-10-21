import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { foldForSearch, lookalikeForSearch, withinEdits } from '../../lib/search/searchNormalize';
import { searchSite, siteSearchJump, SITE_SEARCH_KIND_LABEL, type SiteSearchEntry } from '../../lib/search/siteSearch';
import { buildSiteSearchEntries, creditPersonSub, type SiteSearchPerson, type SiteSearchSources } from '../../lib/search/siteSearchIndex';
import { getAllOperators } from '../../lib/operators/operators';
import { buildAliasMap } from '../../lib/operators/operatorAliases';
import { creditDatabase } from '../../lib/operators/creditDatabase';
import {
  JAPANESE_HAN_ARTISTS, creditNameAliases, creditScript, isJapaneseHanName, romanizationCoverage, romanizeHangul,
} from '../lib/credit-romanization';

/*
 * Artists and voice actors in the site search (lib/search/siteSearchIndex.ts): their rows,
 * the romanized names they answer to (scripts/lib/credit-romanization.ts), and the loose
 * tiers that find a name typed the way it looks rather than the way it is spelled
 * (lib/search/siteSearch.ts), without moving any operator.
 */

test('folding: case, width, accents, spaces and punctuation are one name', () => {
  for (const variant of ['m9nokuro', 'M9NOKURO', 'm9 nokuro', 'Ｍ９ＮＯＫＵＲＯ', 'm9-nokuro', 'M9.Nokuro']) {
    assert.equal(foldForSearch(variant), 'm9nokuro', variant);
  }
  assert.equal(foldForSearch('M・A・O'), 'mao');
  assert.equal(foldForSearch('Nina-Mercedés Rühl'), 'ninamercedesruhl');
  assert.equal(foldForSearch('LAL!ROLE'), 'lalrole');
  assert.equal(foldForSearch('赵爽'), '赵爽', 'a Han name keeps its characters');
  assert.equal(lookalikeForSearch('m9nokuro'), lookalikeForSearch('mgnokuro'));
  assert.equal(lookalikeForSearch('cenm0'), lookalikeForSearch('cenmo'));
});

test('withinEdits counts inserts, deletes, substitutions and swaps, and stops past the limit', () => {
  assert.ok(withinEdits('mgnokuro', 'mlnokuro', 1));
  assert.ok(withinEdits('hanazawa', 'hanazwa', 1));
  assert.ok(withinEdits('hanazawa', 'hanaazwa', 1), 'a swap is one edit');
  assert.ok(!withinEdits('hanazawa', 'hnazwa', 1));
  assert.ok(withinEdits('hanazawa', 'hnazwa', 2));
  assert.ok(!withinEdits('texas', 'exusiai', 2));
});

test('kana are read in Hepburn, Hangul in Revised Romanization, Chinese names in pinyin', () => {
  const artist = (name: string) => creditNameAliases({ kind: 'artist', name });
  assert.deepEqual(artist('カワグチ'), ['kawaguchi']);
  assert.deepEqual(artist('ヌードル'), ['nuudoru', 'nudoru'], 'the long vowel written out, and as it is usually typed');
  assert.deepEqual(artist('azuタロウ'), ['azutarou', 'azutaro']);
  assert.deepEqual(artist('幻象黑兔'), ['huan xiang hei tu', 'huanxiangheitu']);
  assert.deepEqual(artist('三目YYB'), ['san mu YYB', 'sanmuYYB'], 'the Latin part kept as it is');
  assert.deepEqual(artist('IRIS_口艺'), ['IRIS kou yi', 'IRISkouyi']);
  assert.equal(romanizeHangul('김민수'), 'gimminsu');
  assert.equal(romanizeHangul('한글'), 'hangeul');
  assert.deepEqual(creditNameAliases({ kind: 'voice-actor', name: '박서연', languages: ['Korean'] }), ['bakseoyeon']);
  assert.deepEqual(creditNameAliases({ kind: 'voice-actor', name: '赵爽', languages: ['Mandarin'] }), ['zhao shuang', 'zhaoshuang']);
  assert.deepEqual(artist('m9nokuro'), [], 'a Latin name needs no alias');
  assert.deepEqual(creditNameAliases({ kind: 'voice-actor', name: 'M・A・O', languages: ['Japanese'] }), [], 'the middle dot is punctuation, not kana');
});

test('a Japanese name in kanji gets no reading: pinyin of it would be a wrong name', () => {
  // The CN tables credit Japanese actors in simplified characters: 坂本真绫 is not "ban ben zhen ling".
  assert.deepEqual(creditNameAliases({ kind: 'voice-actor', name: '坂本真绫', languages: ['Japanese'] }), []);
  assert.ok(isJapaneseHanName({ kind: 'voice-actor', name: '坂本真绫', languages: ['Japanese'] }));
  assert.ok(!isJapaneseHanName({ kind: 'voice-actor', name: '木雅瑞林', languages: ['Mandarin', 'English'] }));
  assert.deepEqual(creditNameAliases({ kind: 'artist', name: '竜崎いち' }), [], 'part kanji: no whole reading, and no half one');
  assert.deepEqual(creditNameAliases({ kind: 'artist', name: '黒星紅白' }), []);
  assert.equal(creditScript('竜崎いち'), 'kana+han');
});

/* Not a check on the live artist list: a new artist must never hold a content release (the
   no-redeploy rule). A Han name with a character only Japanese writes gets no reading whether
   or not it is listed (isJapaneseHanName), so an unlisted one is safe, just unaliased. */
test('a Han artist written with a character only Japanese uses gets no pinyin, listed or not', () => {
  assert.deepEqual(creditNameAliases({ kind: 'artist', name: '黒田' }), []);
  assert.ok(isJapaneseHanName({ kind: 'artist', name: '黒田' }));
  for (const name of JAPANESE_HAN_ARTISTS) assert.ok(creditScript(name) === 'han', `${name} is a Han-only name`);
});

test('the coverage report counts a Latin name as covered and a kanji one as not', () => {
  const rows = romanizationCoverage([
    { kind: 'artist', name: 'Ask', aliases: [] },
    { kind: 'artist', name: 'カワグチ', aliases: ['kawaguchi'] },
    { kind: 'voice-actor', name: '坂本真绫', languages: ['Japanese'], aliases: [] },
  ]);
  assert.deepEqual(rows.map((r) => [r.script, r.romanized, r.names]).sort(), [['han', 0, 1], ['kana', 1, 1], ['latin', 1, 1]]);
});

test('the romanizer is build-only: nothing the browser or a function loads imports it', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(tsx?|mjs|js)$/.test(entry.name) && /(?:from\s*|import\(\s*|require\(\s*)['"][^'"]*(?:credit-romanization|wanakana|pinyin-pro)['"]/.test(fs.readFileSync(file, 'utf8'))) offenders.push(file);
    }
  };
  for (const dir of ['lib', 'components', 'pages']) walk(dir);
  assert.deepEqual(offenders, []);
  assert.match(fs.readFileSync('scripts/build/build-site-search.ts', 'utf8'), /credit-romanization/);
});

const person = (kind: SiteSearchPerson['kind'], name: string, operators: number, rest: Partial<SiteSearchPerson> = {}): SiteSearchPerson => ({ kind, name, operators, ...rest });
const PEOPLE: SiteSearchPerson[] = [
  person('artist', 'm9nokuro', 4),
  person('artist', 'Skade', 64),
  person('artist', 'Ask', 6),
  person('artist', 'カワグチ', 3, { aliases: ['kawaguchi'] }),
  person('voice-actor', 'Kana Hanazawa', 2, { languages: ['Japanese'] }),
  person('voice-actor', 'M・A・O', 1, { languages: ['Japanese'] }),
  person('voice-actor', '赵爽', 1, { languages: ['Mandarin'], aliases: ['zhao shuang', 'zhaoshuang'] }),
  person('voice-actor', 'Ash Example', 1, { languages: ['English'] }),
];
const EMPTY: SiteSearchSources = { pages: [], operators: [], operatorAliases: {}, events: [], contents: [], stages: [], enemies: [], albums: [], songs: [], creators: [], people: [] };
const OPERATORS = buildSiteSearchEntries({
  ...EMPTY,
  operators: [{ name: 'Skadi', rarity: 6 }, { name: 'Skadi the Corrupting Heart', rarity: 6 }, { name: 'Ash', rarity: 6 }, { name: 'Ashlock', rarity: 5 }, { name: 'Amiya', rarity: 5 }],
});
const WITH_PEOPLE = [...OPERATORS, ...buildSiteSearchEntries({ ...EMPTY, people: PEOPLE })];
const top = (entries: SiteSearchEntry[], query: string, n = 3) => searchSite(entries, query).slice(0, n).map((r) => `${r.entry.kind}:${r.entry.title}`);

test('a person row reads their name, how many operators, and a voice actor\'s languages', () => {
  const rows = buildSiteSearchEntries({ ...EMPTY, people: PEOPLE });
  assert.deepEqual(rows.find((r) => r.title === 'Kana Hanazawa'), {
    kind: 'voice-actor', title: 'Kana Hanazawa', href: '/voice-actors?q=Kana%20Hanazawa', sub: '2 operators · Japanese',
  });
  assert.deepEqual(rows.find((r) => r.title === 'm9nokuro'), { kind: 'artist', title: 'm9nokuro', href: '/artists?q=m9nokuro', sub: '4 operators' });
  assert.equal(creditPersonSub({ operators: 1, languages: ['English', 'Spanish', 'Italian', 'German'] }), '1 operator · English, Spanish, Italian +1');
  assert.equal(SITE_SEARCH_KIND_LABEL.artist, 'Artist');
  assert.equal(SITE_SEARCH_KIND_LABEL['voice-actor'], 'Voice actor');
});

test('m9nokuro is found however it is typed', () => {
  for (const query of ['m9nokuro', 'M9NOKURO', 'm9 nokuro', 'Ｍ９ＮＯＫＵＲＯ', 'mgnokuro', 'minokuro', 'm9nokuor', 'nokuro']) {
    assert.deepEqual(top(WITH_PEOPLE, query, 1), ['artist:m9nokuro'], query);
  }
  assert.deepEqual(top(WITH_PEOPLE, 'mao', 1), ['voice-actor:M・A・O']);
  assert.deepEqual(top(WITH_PEOPLE, 'hanazwa', 1), ['voice-actor:Kana Hanazawa'], 'one typo in a word of the name');
});

test('romanized names find the person', () => {
  assert.deepEqual(top(WITH_PEOPLE, 'zhaoshuang', 1), ['voice-actor:赵爽']);
  assert.deepEqual(top(WITH_PEOPLE, 'zhao shuang', 1), ['voice-actor:赵爽']);
  assert.deepEqual(top(WITH_PEOPLE, 'kawaguchi', 1), ['artist:カワグチ']);
  assert.deepEqual(top(WITH_PEOPLE, 'kana hanazawa', 1), ['voice-actor:Kana Hanazawa']);
});

test('an exact operator name ranks above a person, and an exact person above a part of an operator\'s name', () => {
  assert.deepEqual(top(WITH_PEOPLE, 'skadi'), ['operator:Skadi', 'operator:Skadi the Corrupting Heart', 'artist:Skade'], 'the artist one typo away, after');
  assert.deepEqual(top(WITH_PEOPLE, 'skade', 1), ['artist:Skade'], 'no operator is named Skade');
  assert.deepEqual(top(WITH_PEOPLE, 'ash'), ['operator:Ash', 'operator:Ashlock', 'voice-actor:Ash Example']);
  const jump = (query: string) => siteSearchJump(searchSite(WITH_PEOPLE, query))?.href ?? null;
  assert.equal(jump('ash'), '/operators/Ash');
  assert.equal(jump('Skade'), '/artists?q=Skade', 'an exact name with no operator of it opens the credit page');
  assert.equal(jump('Ask'), '/artists?q=Ask');
  assert.equal(jump('minokuro'), null, 'a typo is never a jump');
  assert.equal(jump('mao'), null, 'nor a folded name');
});

/* The real catalogue: the operators' own ranking for the queries people type most must be
   the one it was before people joined the index. The loose tiers sit under every other, and
   person rows only add, so the operator rows come out in the same order with or without. */
test('the top operator results for common queries are the same with people in the index', () => {
  const operators = getAllOperators();
  const sources: SiteSearchSources = {
    ...EMPTY,
    operators: operators.map((op) => ({ name: op.name, rarity: op.rarity })),
    operatorAliases: buildAliasMap(operators),
  };
  const people: SiteSearchPerson[] = (['artists', 'voice-actors'] as const).flatMap((page) => creditDatabase(page).people
    .map((p) => person(page === 'artists' ? 'artist' : 'voice-actor', p.name, p.operators.length)));
  const before = buildSiteSearchEntries(sources);
  const after = buildSiteSearchEntries({ ...sources, people });
  const operatorsOnly = (entries: SiteSearchEntry[], query: string) => searchSite(entries, query)
    .filter((r) => r.entry.kind === 'operator' && r.score <= 4).slice(0, 5).map((r) => r.entry.title);
  const queries = ['amiya', 'chen', 'w', 'skadi', 'texas', 'exusiai', 'kaltsit', 'mudrock', 'ash', 'surtr', 'eyja', 'silverash', 'thorns', 'wisadel', 'mlynar', 'lappland', 'specter', 'blaze', 'saria', 'ifrit'];
  for (const query of queries) {
    assert.deepEqual(operatorsOnly(after, query), operatorsOnly(before, query), query);
    const first = searchSite(before, query)[0];
    if (first?.exact) assert.equal(searchSite(after, query)[0].entry.href, first.entry.href, `${query}: the exact operator stays first`);
  }
  assert.ok(people.length > 1000, 'every credited person is in the index');
});
