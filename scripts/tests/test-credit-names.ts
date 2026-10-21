import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditDatabase, creditNameVariants, type CreditKind } from '../../lib/operators/creditDatabase';
import {
  CREDIT_NAME_SPELLINGS, JOINT_CREDIT_NAMES, artCreditKind, canonicalCreditSpelling, creditNameKey, creditedPeople, decodeCreditEntities,
  isPlaceholderCredit, letterGroup, letterGroupRank, shortArtCredit,
} from '../../lib/operators/creditNames';
import { publicFileExists } from '../../lib/assets/publicAssets';

test('a placeholder credit names nobody', () => {
  for (const name of ['-', ' - ', '—', '–', '', '   ', '?', '??', 'Unknown', 'unknown', 'N/A', 'n/a', 'TBA', 'TBD', 'None', 'Uncredited', '未知', null, undefined]) {
    assert.ok(isPlaceholderCredit(name), `${JSON.stringify(name)} is a placeholder`);
  }
  // Short real names stay people: the voice tables credit "Z", "ZZ", "Icy", "Sue" and "Qd".
  for (const name of ['Z', 'ZZ', 'Icy', 'Sue', 'Qd', 'D. QQ', 'Miss.Christine', 'Ask', '臼', '〇亻', 'U介']) {
    assert.ok(!isPlaceholderCredit(name), `${name} is a name`);
  }
});

test('/voice-actors lists the "-" credits once, under Uncredited, never as a person', () => {
  const data = creditDatabase('voice-actors');
  assert.ok(data.people.length > 100);
  const placeholders = data.people.filter(person => isPlaceholderCredit(person.name));
  assert.deepEqual(placeholders.map(p => p.name), [], 'no person is a placeholder');
  // The three operators the screenshot showed under a group called "-".
  const unnamed = new Map(data.uncredited.map(entry => [entry.name, entry.credits]));
  for (const name of ['Miss.Christine', 'Rhodes Island Recon', 'Terra Research Commission']) assert.ok(unnamed.has(name), `${name} is under Uncredited`);
  assert.deepEqual(unnamed.get('Miss.Christine'), ['Japanese', 'Mandarin']);
  // Every operator a row names is described for the filters.
  const described = new Set(data.operators.map(op => op.name));
  for (const entry of [...data.people.flatMap(p => p.operators), ...data.uncredited]) assert.ok(described.has(entry.name), entry.name);
});

test('/artists has no placeholder person, and every operator carries what the filters read', () => {
  const data = creditDatabase('artists');
  assert.deepEqual(data.people.filter(person => isPlaceholderCredit(person.name)).map(p => p.name), []);
  assert.ok(data.people.some(p => p.operators.some(op => op.name === 'Thorns')));
  // Outfits are credited by name, beside the base art and the promotions.
  const kinds = new Set(data.people.flatMap(p => p.operators.flatMap(op => op.credits.map(artCreditKind))));
  assert.deepEqual([...kinds].sort(), ['art', 'design', 'outfit']);
  for (const op of data.operators) {
    assert.ok(op.rarity === null || (op.rarity >= 1 && op.rarity <= 6), `${op.name}: rarity`);
    assert.ok(op.releasedAt === null || Number.isFinite(op.releasedAt), `${op.name}: release marker`);
    // An icon is only handed over when the asset index has it, so a tile never 404s.
    if (op.icon) assert.ok(publicFileExists(decodeURIComponent(op.icon)), `${op.name}: ${op.icon}`);
  }
});

test('names group by letter, script and symbol, in that order', () => {
  assert.equal(letterGroup('Abby'), 'A');
  assert.equal(letterGroup('émilie'), 'E');
  assert.equal(letterGroup('3MO'), '#');
  assert.equal(letterGroup('〇亻'), 'han');
  assert.equal(letterGroup('竜崎いち'), 'han');
  assert.equal(letterGroup('アシマ'), 'kana');
  assert.equal(letterGroup('おぐち'), 'kana');
  assert.equal(letterGroup('김'), 'hangul');
  assert.ok(letterGroupRank('Z') < letterGroupRank('#') && letterGroupRank('#') < letterGroupRank('kana') && letterGroupRank('kana') < letterGroupRank('han'));
  assert.equal(shortArtCredit('Operator artwork'), 'Base');
  assert.equal(shortArtCredit('Elite 2'), 'E2');
  assert.equal(shortArtCredit('Summer Flower FA083'), 'Summer Flower FA083');
});

test('a joined credit is each of its people, entities decoded', () => {
  const cases: [string, string[]][] = [
    ['Lowro & Studio Montagne', ['Lowro', 'Studio Montagne']],
    ['Lowro &amp; Studio Montagne', ['Lowro', 'Studio Montagne']],
    ['Lowro &amp;amp; Studio Montagne', ['Lowro', 'Studio Montagne']],
    ['Stephen Spencer & Georgia Cudby', ['Stephen Spencer', 'Georgia Cudby']],
    ['Stephen Spencer &amp; Georgia Cudby', ['Stephen Spencer', 'Georgia Cudby']],
    ['幻象黑兔 , Mag42', ['幻象黑兔', 'Mag42']],
    ['百慕大飞鱼, Mag42', ['百慕大飞鱼', 'Mag42']],
    ['海猫络合物 & 唯@W', ['海猫络合物', '唯@W']],
    ['海猫络合物 &#38; 唯@W', ['海猫络合物', '唯@W']],
    ['海猫络合物、唯@W', ['海猫络合物', '唯@W']],
    ['幻象黑兔 / Mag42', ['幻象黑兔', 'Mag42']],
    ['Alessandro\u00a0Pili', ['Alessandro Pili']],
    ['Mag42, Mag42', ['Mag42']],
    ['Mag42, -', ['Mag42']],
    ['-', []],
    ['唯@W', ['唯@W']],
    ['D. QQ', ['D. QQ']],
  ];
  for (const [raw, people] of cases) assert.deepEqual(creditedPeople(raw), people, raw);
  assert.equal(decodeCreditEntities('A &quot;B&quot; &lt;C&gt; &#x26; D'), 'A "B" <C> & D');
});

test('a "(credited as ...)" note is the person it is about', () => {
  const cases: [string, string][] = [
    ['〇亻 (credited as "Studio Montagne" in-game)', '〇亻'],
    ['〇亻 (credited as "Ubisoft" in-game)', '〇亻'],
    ['Cenm0 (credited as "Ubisoft" in-game)', 'Cenm0'],
    ['Kumatangent (credited as "熊太")', 'Kumatangent'],
    ['Liduke (credited as "Ubisoft" in-game)', 'Liduke'],
    ['m9nokuro (credited as &quot;Ubisoft&quot; in-game)', 'm9nokuro'],
    ['九日九号 (credited as Studio Montagne in-game)', '九日九号'],
    ['伍秋秋秋秋 (credited as Studio Montagne in-game)', '伍秋秋秋秋'],
    ['百慕大飞鱼 (credited as Studio Montagne in-game)', '百慕大飞鱼'],
    ['Studio Montagne (additional design by Kumatangent)', 'Studio Montagne'],
    ['KuroBlood (with additional art by 一千 for original design)', 'KuroBlood'],
  ];
  for (const [raw, person] of cases) assert.deepEqual(creditedPeople(raw), [person], raw);
});

test('names differing only in case are one person, under the reviewed spelling', () => {
  for (const [variants, shown] of [[['Ask', 'ASK'], 'Ask'], [['Hou', 'hou'], 'hou'], [['Infukun', 'infukun'], 'Infukun'], [['Skade', 'skade'], 'Skade'], [['U介', 'u介'], 'u介']] as const) {
    for (const name of variants) assert.equal(CREDIT_NAME_SPELLINGS[creditNameKey(name)], shown, name);
    assert.equal(canonicalCreditSpelling(new Map(variants.map(name => [name, 1]))), shown);
  }
  // A pair nobody has listed takes the spelling credited on more operators, then a fixed order.
  assert.equal(canonicalCreditSpelling(new Map([['abc', 1], ['ABC', 4]])), 'ABC');
  assert.equal(canonicalCreditSpelling(new Map([['abc', 2], ['ABC', 2]])), 'ABC');
  // Case only: a space or a dot is a different card.
  assert.notEqual(creditNameKey('Ama Lee'), creditNameKey('AmaLee'));
});

/** A name still joined, encoded or annotated: what the source strings looked like before. */
const LEFTOVER = [
  [/&(?:[a-z]+|#x?[0-9a-f]+);/i, 'an HTML entity'],
  [/&|＆/, 'an "&"'],
  [/[,，、;；]|\s[/／]\s/, 'a separator'],
  [/[()（）]/, 'a note in brackets'],
  [/\bcredited as\b|\badditional (?:design|art)\b/i, 'a credit note'],
  [/[^\S ]|\s{2}|^\s|\s$/, 'stray whitespace'],
] as const;

for (const kind of ['artists', 'voice-actors'] as CreditKind[]) {
  test(`/${kind}: every person is one person, named once`, () => {
    const data = creditDatabase(kind);
    const byKey = new Map<string, string[]>();
    for (const person of data.people) byKey.set(creditNameKey(person.name), [...(byKey.get(creditNameKey(person.name)) ?? []), person.name]);
    assert.deepEqual([...byKey.values()].filter(names => names.length > 1), [], 'no two people differ only in case');
    for (const person of data.people) {
      if (JOINT_CREDIT_NAMES.includes(person.name)) continue;
      for (const [pattern, what] of LEFTOVER) assert.ok(!pattern.test(person.name), `${JSON.stringify(person.name)} has ${what}`);
    }
    // Every case pair the sources spell two ways is on the reviewed list, so no merge is a guess.
    for (const [shown, spellings] of creditNameVariants(kind)) {
      assert.equal(CREDIT_NAME_SPELLINGS[creditNameKey(shown)], shown, `${spellings.join(' / ')}: add the EN tables' spelling to CREDIT_NAME_SPELLINGS`);
    }
  });
}

/* On the live data only what must hold whatever a release brings: no joined or case-variant
   name is a card. Which operator a given person drew is the data's to change (the content run's
   refreshed tables moved one, 2026-10-21) and must never hold a release; the splitting itself is
   tested on fixed strings above (creditedPeople). */
test('/artists: no joined or case-variant credit is a card of its own', () => {
  const people = new Set(creditDatabase('artists').people.map(p => p.name));
  for (const gone of ['ASK', 'Hou', 'infukun', 'skade', 'U介', 'Lowro & Studio Montagne', '幻象黑兔 , Mag42', '百慕大飞鱼, Mag42', '海猫络合物 & 唯@W']) {
    assert.ok(!people.has(gone), `${gone} is not a card`);
  }
});

test('/voice-actors: no joined actor credit is a card of its own', () => {
  assert.ok(!creditDatabase('voice-actors').people.some(p => p.name === 'Stephen Spencer & Georgia Cudby'));
});
