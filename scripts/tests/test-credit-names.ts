import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditDatabase } from '../../lib/operators/creditDatabase';
import { artCreditKind, isPlaceholderCredit, letterGroup, letterGroupRank, shortArtCredit } from '../../lib/operators/creditNames';
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
