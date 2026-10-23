import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAliasMap } from '../../lib/operators/operatorAliases';
import { getAllOperators } from '../../lib/operators/operators';
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
import { renameAlternates } from '../sync/catalogue-model.mjs';

/*
 * /operator-planner's export builds the alias map from every record and throws on an `alternate` that
 * names no operator (lib/operators/operatorAliases.ts). On 2026-10-14 Global renamed
 * Kal'tsit - Esperanta to Kal'tsit Esperanta, Kal'tsit's alternate kept the old name, and the
 * content run failed on the planner's props. Nothing tested the map on its own data before.
 */

test('every alternate name in the data names an operator record', () => {
  const operators = getAllOperators();
  const map = buildAliasMap(operators.map((op) => ({ name: op.name, alternate: op.alternate, aliases: op.aliases })));
  const names = new Set(operators.map((op) => op.name));
  for (const op of operators.filter((o) => o.alternate?.trim())) {
    assert.ok(map[op.name]?.length, `${op.name} has its alters as aliases`);
    for (const alias of map[op.name]) assert.ok(names.has(alias), `${op.name} -> ${alias} is a record`);
  }
});

test('an alternate naming a record\'s former name finds the record; an unknown one still throws', () => {
  const records = [
    { name: "Kal'tsit", alternate: "[CN] Kal'tsit - Esperanta" },
    { name: "Kal'tsit Esperanta", alternate: null, aliases: ["Kal'tsit - Esperanta"] },
  ];
  assert.deepEqual(buildAliasMap(records), { "Kal'tsit": ["Kal'tsit Esperanta"], "Kal'tsit Esperanta": ["Kal'tsit"] });
  assert.throws(() => buildAliasMap([...records, { name: 'Somebody', alternate: 'Nobody' }]), /Somebody -> Nobody/);
});

test('the catalogue renames the alters a record names along with the renamed record', () => {
  const operators = [
    { name: "Kal'tsit", sourceRegion: 'Global', alternate: "[CN] Kal'tsit - Esperanta" },
    { name: "Kal'tsit Esperanta", sourceRegion: 'Global', alternate: null },
    { name: "Ch'en", sourceRegion: 'Global', alternate: "Ch'en the Holungday , Ch'en the Dawnstreak" },
    { name: "Ch'en the Holungday", sourceRegion: 'Global', alternate: null },
    { name: "Ch'en the Dawn", sourceRegion: 'CN', alternate: null },
    // A record from before the catalogue wrote sourceRegion, out on Global since 2026-09-10.
    { name: 'Zima', alternate: '[CN] Zima the Raging Tide' },
    { name: 'Zima the Raging Tide', alternate: null },
    { name: 'Angelina', sourceRegion: 'Global', alternate: '[CN] Angelina the Mellow Wish' },
    { name: 'Angelina the Mellow Wish', sourceRegion: 'CN', alternate: null },
    // In the Global tables, but its banner has not opened yet.
    { name: 'Texas', sourceRegion: 'Global', alternate: '[CN] Texas the Next' },
    { name: 'Texas the Next', sourceRegion: 'Global', isFuture: true, alternate: null },
  ];
  const renames = new Map([["Kal'tsit - Esperanta", "Kal'tsit Esperanta"], ["Ch'en the Dawnstreak", "Ch'en the Dawn"]]);
  assert.deepEqual(renameAlternates(operators, renames), ["Kal'tsit", "Ch'en", 'Zima']);
  assert.deepEqual(operators.map((op) => op.alternate), [
    // Renamed with its record, the [CN] marker gone with the record's release on Global.
    "Kal'tsit Esperanta", null,
    // One part of a pair, the pair's spacing kept; a CN alter is marked.
    "Ch'en the Holungday , [CN] Ch'en the Dawn", null, null,
    // A marker left over from before the alter's Global release goes; one Global has not shipped stays.
    'Zima the Raging Tide', null,
    '[CN] Angelina the Mellow Wish', null,
    '[CN] Texas the Next', null,
  ]);
  // A rename an earlier run missed: the name is only a record's former name now.
  const stale = [
    { name: "Kal'tsit", sourceRegion: 'Global', alternate: "[CN] Kal'tsit - Esperanta" },
    { name: "Kal'tsit Esperanta", sourceRegion: 'Global', alternate: null, aliases: ["Kal'tsit - Esperanta"] },
  ];
  assert.deepEqual(renameAlternates(stale, new Map()), ["Kal'tsit"]);
  assert.equal(stale[0].alternate, "Kal'tsit Esperanta");
  // Nothing to do changes nothing.
  assert.deepEqual(renameAlternates(stale, new Map()), []);
});
