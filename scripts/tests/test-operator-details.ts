import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyModuleStatBonuses, getBaseStats, getTrustBonus, clampInteger, parseModuleStatBonuses, STAT_KEYS, OperatorStats, StatPhase } from '../../lib/operators/operatorStats';
import { Operator } from '../../lib/operators/operatorTypes';
import { readCsv } from '../lib/operator-csv';
import { getBaseSkillIconPath, getSkillIconPath, baseSkillDisplayName, talentDisplayName, getEssentialIconPath } from '../../lib/operators/operatorIconPaths';
import { getOperatorIconPath, OPERATOR_PORTRAIT_PLACEHOLDER } from '../../lib/operators/operatorIcon';
import { isPortraitPending } from '../../lib/operators/operatorPortrait';
import { getOperatorSearchResults, loadOperatorSearch } from '../../lib/operators/operatorSearch';
import { getOperatorAppearances } from '../../lib/operators/operatorAppearances';
import { getOperatorArtworkCredits } from '../../lib/operators/operatorArtworkCredits';
import { getAllSkins } from '../../lib/skins/skins';
import { getOperatorAttackRanges } from '../../lib/operators/operatorAttackRanges';
import type { CroppedRange } from '../../lib/operators/branchRanges';
import OPERATOR_DEPLOY from '../../public/operator-deploy.json';
import { getFactionIconPath } from '../../lib/operators/classBranchIcons';
import { getAllOperators } from '../../lib/operators/operators';
import { traitPhases } from '../../lib/operators/operatorTrait';
import { buildGachaOperatorPreview } from '../../lib/gacha/operatorPreviewData';

const operators: Operator[] = [1, 2, 3, 4, 5, 6].flatMap(star => {
  const dir = `data/operators-${star}star`;
  return fs.readdirSync(dir).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8')));
});
/* By name only for operators Global has released, whose English names are official.
   A CN-only operator carries the wiki's community name until Global announces the
   real one, and that rename arrives with the daily refresh -- so it is looked up by
   character id, and op() refuses it rather than let a test pin a name that will move. */
const op = (name: string) => {
  const found = operators.find(row => row.name === name);
  assert(found, name);
  assert(!found.sourceRegion, `${name} is not released on Global yet; look it up with byId('${found.internalName}')`);
  return found;
};
const byId = (id: string) => { const found = operators.find(row => row.internalName === id); assert(found, id); return found; };
const stats = (name: string) => { const found = op(name).stats; assert(found); return found; };

/* Whether each emblem is published is check-icon-coverage's question: for an operator out
   on Global it fails a pull request (check:assets) and holds back the emblem in the daily
   release (check:assets:release); it lists the rest, whose art lands after the record.
   Asked here too, a new CN team's emblem failed the day's release, which runs npm test,
   while the page leaves out an emblem it has no file for. */
test('all operator factions resolve to artwork emblem paths', () => {
  for (const operator of operators) {
    if (!operator.faction && operator.sourceRegion) continue; // New source teams can precede their translated emblem metadata.
    assert(getFactionIconPath(operator.faction), `${operator.name}: no faction emblem`);
  }
  for (const [faction, filename] of [
    ['Aegir', 'Ægir.webp'], ['Blacksteel', 'Blacksteel Worldwide.webp'],
    ['Elite Op', 'Rhodes Island-Elite Operator.webp'], ['Lungmen', 'Yan-Lungmen.webp'],
    ['Op A4', 'Op Team A4.webp'], ['Op Reserve A1', 'Reserve Op Team A1.webp'],
    ['Op Reserve A4', 'Reserve Op Team A4.webp'], ['Op Reserve A6', 'Reserve Op Team A6.webp'],
    ['Pinus Sylvestris', 'Pinus Sylvestris Knightclub.webp'], ["Chiave's Gang", "Chiave's Gang.webp"],
    ["Laios's Party", 'Rhodes Island.webp'], ['Ave Mujica', 'Rhodes Island.webp'],
  ]) assert.equal(getFactionIconPath(faction), `/faction-icons/${filename}`);
  assert.equal(getFactionIconPath(null), null);
});

const attackRanges = (name: string) => getOperatorAttackRanges(op(name), OPERATOR_DEPLOY.ranges);
const rangeOffsets = (range: CroppedRange) => [[0, 0], ...range.rangeCells.map(([row, col]) =>
  [col - range.opCell[1], row - range.opCell[0]])].sort(([af, al], [bf, bl]) => al - bl || af - bf);

test('overview range choices keep only the first promotion with each distinct range', () => {
  for (const [name, elites] of [
    ['Kroos', [0, 1]], ['Exusiai', [0, 1]], ['Amiya', [0, 1]],
    ['Frostleaf', [0, 1, 2]], ['Tachanka', [0, 2]], ["Kal'tsit", [0, 1, 2]], ['SilverAsh', [0, 1]],
    ['Rangers', [0]], ['Dobermann', [0]], ['Amiya (Guard)', [2]], ['Amiya (Medic)', [2]],
  ] as const) {
    assert.deepEqual(attackRanges(name).map(choice => choice.elite), elites, name);
  }
});

test('normal attack ranges include permanent talent effects but exclude auras and skill-only changes', () => {
  const frostleaf = attackRanges('Frostleaf');
  assert.equal(frostleaf[2].talent, 'Covered Strike');
  assert.deepEqual(rangeOffsets(frostleaf[2].range), [
    [0, -1], [1, -1], [2, -1], [0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1],
  ]);
  assert.notDeepEqual(frostleaf[1].range, frostleaf[2].range);
  const tachanka = attackRanges('Tachanka');
  assert.deepEqual(rangeOffsets(tachanka[0].range), [[0, 0], [1, 0], [2, 0]]);
  assert.deepEqual(rangeOffsets(tachanka[1].range), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.deepEqual(attackRanges('Tomimi').map(choice => choice.range), attackRanges('Amiya').map(choice => choice.range));
  assert.equal(attackRanges('Dobermann')[0].talent, null);
  assert.equal(attackRanges('Bena').at(-1)?.range.rows, 1);
});

test('range deduplication compares tiles rather than range IDs or source ordering', () => {
  const source = op('Exusiai');
  const phases = source.stats!.phases.map((phase, index) => ({ ...phase, rangeId: `alias-${index}` }));
  const choices = getOperatorAttackRanges({ ...source, stats: { ...source.stats!, phases } }, {
    'alias-0': [[0, 0], [1, 0]], 'alias-1': [[1, 0], [0, 0]], 'alias-2': [[0, 0], [1, 0], [2, 0]],
  });
  assert.deepEqual(choices.map(choice => choice.elite), [0, 2]);
});

test('every operator and form has valid, unique overview ranges from its actual promotions', () => {
  for (const operator of operators) {
    const choices = getOperatorAttackRanges(operator, OPERATOR_DEPLOY.ranges);
    assert(choices.length > 0, operator.name);
    const firstElite = ['Amiya (Guard)', 'Amiya (Medic)'].includes(operator.name) ? 2 : operator.stats!.phases[0].elite;
    assert.equal(choices[0].elite, firstElite, operator.name);
    assert.equal(new Set(choices.map(choice => JSON.stringify(rangeOffsets(choice.range)))).size, choices.length, operator.name);
    for (const { elite, range } of choices) {
      assert(operator.stats!.phases.some(phase => phase.elite === elite), operator.name);
      for (const [row, col] of [range.opCell, ...range.rangeCells]) {
        assert(Number.isInteger(row) && row >= 1 && row <= range.rows, operator.name);
        assert(Number.isInteger(col) && col >= 1 && col <= range.cols, operator.name);
      }
    }
  }
});

test('outfit credits follow the selected artwork while Base and Elite show only their illustrator', () => {
  const operator = op('Exusiai');
  const credits = getOperatorArtworkCredits(operator, getOperatorAppearances(operator), getAllSkins());
  assert.equal(credits['Midnight Delivery'].illustrator, '尾鱼');
  assert.equal(credits['Wild Operation'].illustrator, '幻象黑兔');
  assert.equal(credits.Base.illustrator, '幻象黑兔');
  assert.deepEqual(credits['Elite 2'], credits.Base);
});

test('base artwork excludes skin, promotional-art and NPC illustrator annotations', () => {
  const skins = getAllSkins();
  for (const [name, illustrator] of [
    ['Exusiai', '幻象黑兔'], ['Amiya', '唯@W'], ['Amiya (Guard)', '唯@W'],
    ['Amiya (Medic)', '唯@W'], ['Saria', 'NoriZC'], ['Wiš\'adel', 'Liduke'],
    ['Fiammetta', '幻象黑兔'], ['Cuora', 'Skade'], ['Estelle', '鸭'],
    ['Vermeil', 'KENTllaall'], ['Breeze', '藻'], ['PhonoR-0', 'M1917史密斯维森'],
    ['Nightmare', 'Lpip'], ['Lappland the Decadenza', '幻象黑兔'], ['Lin', '三目YYB'],
    ['Blaze the Igniting Spark', 'Mag42'], ['Vina Victoria', 'Studio Montagne'],
  ]) {
    assert.equal(getOperatorArtworkCredits(op(name), [], skins).Base.illustrator, illustrator, name);
  }
  for (const operator of operators) {
    if (operator.characterInfo?.Illustrator?.trim()) {
      assert(getOperatorArtworkCredits(operator, [], skins).Base.illustrator, `${operator.name}: base credit lost`);
    }
  }
});

test('explicit operator-art and original-design roles remain separate', () => {
  const skins = getAllSkins();
  for (const [name, illustrator, originalDesigner] of [
    ["Kal'tsit", '唯@W', '海猫络合物'], ['Ines', '板板', 'Liduke'],
    ['Crownslayer', '直立行走', '海猫络合物'], ['Miss.Christine', 'YUJI', 'Skade'],
    ['Nasti', 'AerialB', 'Ametora'], ['W', 'Liduke', null],
  ] as const) {
    assert.deepEqual(getOperatorArtworkCredits(op(name), [], skins).Base, { illustrator, originalDesigner }, name);
  }
  // Kal'tsit - Esperanta and Mechanist, still CN-only.
  for (const [id, illustrator, originalDesigner] of [
    ['char_1052_kalts2', 'Studio Montagne', '海猫络合物 & 唯@W'], ['char_4230_mcnist', 'Studio Montagne', 'Cenm0'],
  ] as const) {
    assert.deepEqual(getOperatorArtworkCredits(byId(id), [], skins).Base, { illustrator, originalDesigner }, id);
  }
});

test('base credit parsing preserves artist aliases and complete multiword names', () => {
  assert.equal(getOperatorArtworkCredits(op('Akafuyu'), [], getAllSkins()).Base.illustrator, 'Kumatangent (credited as "熊太")');
  for (const name of ['Studio Montagne', 'TEAM EXPNDR', 'Peachy Miruku', 'Lowro & Studio Montagne']) {
    const operator = { name: 'Example', characterInfo: { Illustrator: name } };
    assert.equal(getOperatorArtworkCredits(operator, [], []).Base.illustrator, name);
  }
});

test('outfit credits preserve the original character designer', () => {
  const operator = op('Thorns the Lodestar');
  const credits = getOperatorArtworkCredits(operator, getOperatorAppearances(operator), getAllSkins());
  assert.equal(credits['Boundless Sail'].illustrator, '嘎嘎人');
  assert.equal(credits['Boundless Sail'].originalDesigner, '幻象黑兔');
  assert.equal(credits.Base.originalDesigner, '幻象黑兔');
});

test('outfit credits resolve filename punctuation and stay scoped to the operator', () => {
  const operator = op('Surtr');
  const credits = getOperatorArtworkCredits(operator, getOperatorAppearances(operator), getAllSkins());
  assert.equal(credits['LibertéÉchec'].illustrator, 'ASK');
  const unrelated = getOperatorArtworkCredits(operator, [{ label: 'Guest outfit', fullPath: null }], [
    { model: 'Exusiai', name: 'Guest outfit', image: null, illustrator: 'Another artist' },
  ]);
  assert.equal(unrelated['Guest outfit'].illustrator, null);
});

test('missing outfit credits never assign the operator illustrator to an unknown outfit', () => {
  const operator = { name: 'Example', characterInfo: { Illustrator: 'Base artist (original design by Designer)' } };
  const appearances = [{ label: 'Unlisted outfit', fullPath: null }, { label: 'Uncredited outfit', fullPath: null }];
  const credits = getOperatorArtworkCredits(operator, appearances, [
    { model: 'Example', name: 'Uncredited outfit', image: null, illustrator: null },
  ]);
  for (const appearance of appearances) {
    assert.deepEqual(credits[appearance.label], { illustrator: null, originalDesigner: 'Designer' });
  }
  assert.equal(getOperatorArtworkCredits(operator, [], []).Base.illustrator, 'Base artist');
});

// Whether every CN source identity has a record is scripts/content/check-completeness.mjs's
// question, asked in the refresh itself, where a record left out on purpose can be told
// apart from one that is missing.
test('all roster records have complete, finite stats and nonempty archives', () => {
  for (const operator of operators) {
    assert(operator.stats?.phases.length, operator.name);
    assert(operator.files?.length, operator.name);
    for (const phase of operator.stats.phases) {
      for (let level = phase.minLevel; level <= phase.maxLevel; level++) {
        assert(STAT_KEYS.every(key => Number.isFinite(getBaseStats(phase, level)[key])), `${operator.name} E${phase.elite} L${level}`);
      }
    }
    assert(operator.files.every(file => file.section && file.unlock && file.description), operator.name);
  }
});

test('a trait that changes with promotion is shown per phase, labelled, wherever a trait renders', () => {
  assert.deepEqual(traitPhases('Heals'), [{ stage: null, text: 'Heals' }]);
  assert.deepEqual(traitPhases(null), []);
  assert.deepEqual(traitPhases(''), []);
  // Promotion order whatever the key order, and no phase the record does not have.
  assert.deepEqual(traitPhases({ 'Elite 2': 'four', Base: 'three' }), [{ stage: 'Base', text: 'three' }, { stage: 'Elite 2', text: 'four' }]);
  const pudding = op('Pudding');
  assert.deepEqual(traitPhases(pudding.trait).map(line => line.stage), ['Base', 'Elite 2']);
  assert.match(traitPhases(pudding.trait)[1].text, /jump between 4 enemies/);
  assert.deepEqual(buildGachaOperatorPreview(pudding).traitPhases, traitPhases(pudding.trait), 'the /gacha preview sends every phase, not the last');
  assert.deepEqual(traitPhases(op('Ceylon').trait).map(line => line.stage), [null]);
  // Every record: a per-phase trait is keyed by the stages the page labels, so none renders unlabelled or empty.
  for (const operator of operators) {
    if (!operator.trait || typeof operator.trait === 'string') continue;
    assert.ok(Object.keys(operator.trait).every(stage => /^(?:Base|Elite [12])$/.test(stage)), `${operator.name}: ${Object.keys(operator.trait).join(', ')}`);
    assert.equal(traitPhases(operator.trait).length, Object.keys(operator.trait).length, operator.name);
  }
});

test('promotion costs use the flat material list consumed by operator pages', () => {
  for (const operator of operators) {
    for (const tier of operator.promotion) {
      assert(Array.isArray(tier.cost), `${operator.name} ${tier.tier}`);
      for (const material of tier.cost) {
        assert.equal(typeof material.name, 'string', `${operator.name} ${tier.tier}`);
        assert(Number.isFinite(Number(material.quantity)), `${operator.name} ${material.name}`);
      }
    }
  }
  assert.deepEqual(op('Amiya').promotion[0].cost.find(item => item.name === 'LMD'), { name: 'LMD', quantity: 20000 });
});

test('Amiya promotion endpoints, mid-level rounding, and promotion-dependent costs', () => {
  const phases = stats('Amiya').phases;
  assert.deepEqual(getBaseStats(phases[0], 1), { hp: 699, atk: 276, def: 48, res: 10, redeploy: 70, dp: 18, block: 1, interval: 1.6 });
  assert.deepEqual(getBaseStats(phases[0], 2), { hp: 704, atk: 278, def: 49, res: 10, redeploy: 70, dp: 18, block: 1, interval: 1.6 });
  assert.equal(getBaseStats(phases[1], 1).dp, 20);
  assert.equal(getBaseStats(phases[2], 80).atk, 612);
});

test('level limits, single-level phases, and supplied exceptions', () => {
  const phase = stats('Exusiai').phases[0];
  assert.deepEqual(getBaseStats(phase, -10), phase.base);
  assert.deepEqual(getBaseStats(phase, 999), phase.max);
  assert.deepEqual(getBaseStats(phase, NaN), phase.base);
  const single: StatPhase = { ...phase, minLevel: 1, maxLevel: 1, max: phase.base };
  assert.deepEqual(getBaseStats(single, 50), phase.base);
  const exception = { ...phase, overrides: { '2': { atk: 999 } } };
  assert.equal(getBaseStats(exception, 2).atk, 999);
  assert.equal(clampInteger(6.9, 1, 10), 6);
  assert.equal(clampInteger(Infinity, 1, 10), 1);
});

test('trust uses battle phases, rounds the bonus, and caps at 100%', () => {
  const amiya = stats('Amiya');
  assert.deepEqual(getTrustBonus(amiya, 0), { hp: 0, atk: 0, def: 0 });
  assert.deepEqual(getTrustBonus(amiya, 50), { hp: 100, atk: 35, def: 0 });
  assert.deepEqual(getTrustBonus(amiya, 100), { hp: 200, atk: 70, def: 0 });
  assert.deepEqual(getTrustBonus(amiya, 200), getTrustBonus(amiya, 100));
  assert.deepEqual(getTrustBonus(amiya, -1), getTrustBonus(amiya, 0));
  assert.deepEqual(getTrustBonus(amiya, NaN), getTrustBonus(amiya, 0));
  const exusiai = stats('Exusiai');
  assert.equal(getTrustBonus(exusiai, 1).atk, 0);
  assert.equal(getTrustBonus(exusiai, 2).atk, 2);
  assert.equal(getTrustBonus(exusiai, 3).atk, 2);
  assert.equal(getTrustBonus(exusiai, 99).atk, 88);
  assert.equal(getTrustBonus(exusiai, 100).atk, 90);
  const zero: OperatorStats = { ...amiya, trust: { hp: 0, atk: 0, def: 0 } };
  assert.deepEqual(getTrustBonus(zero, 200), { hp: 0, atk: 0, def: 0 });
});

test('module attributes update direct stats and convert ASPD to attack interval', () => {
  assert.deepEqual(parseModuleStatBonuses('HP +200 , DEF +50 , Block +1'), { hp: 200, def: 50, block: 1 });
  assert.deepEqual(parseModuleStatBonuses('DEF +30 , Rdp. -25 sec. , ASPD +5'), { def: 30, redeploy: -25, aspd: 5 });
  assert.deepEqual(parseModuleStatBonuses('ATK +57 , Cost -8 , RES +3'), { atk: 57, dp: -8, res: 3 });
  const base = getBaseStats(stats('Exusiai').phases[2], 90);
  const adjusted = applyModuleStatBonuses(base, { hp: 190, atk: 41, block: 1, redeploy: -10, aspd: 5 });
  assert.equal(adjusted.hp, base.hp + 190);
  assert.equal(adjusted.atk, base.atk + 41);
  assert.equal(adjusted.block, base.block + 1);
  assert.equal(adjusted.redeploy, base.redeploy - 10);
  assert.equal(adjusted.interval, base.interval * 100 / 105);
});

test('rarity and class forms keep their own promotion limits and files', () => {
  assert.deepEqual(stats('Lancet-2').phases.map(phase => phase.maxLevel), [30]);
  assert.deepEqual(stats('Kroos').phases.map(phase => phase.maxLevel), [40, 55]);
  for (const [name, form] of [['Amiya', 'Caster'], ['Amiya (Guard)', 'Guard'], ['Amiya (Medic)', 'Medic']]) {
    assert(op(name).files!.every(file => file.section.includes(form)), name);
  }
  assert(!op('Amiya (Guard)').files!.some(file => file.section.includes('Clinical Analysis (Medic)')));
  assert(!op('Amiya (Medic)').files!.some(file => file.section.includes('Clinical Analysis (Caster / Guard)')));
  assert.notEqual(stats('Amiya (Medic)').phases[2].max.atk, stats('Amiya').phases[2].max.atk);
  assert.equal(op('Raidian').internalName, 'char_4195_radian');
  assert.notEqual(byId('char_4230_mcnist').name, op('Raidian').name);
});

test('CSV parser preserves paragraph breaks, quotes and Unicode, and rejects malformed data', () => {
  assert.deepEqual(readCsv('\uFEFFname,text\r\nAmiya,"Line one, then ""quoted""\r\n\r\n■■■"\r\n'), [{ name: 'Amiya', text: 'Line one, then "quoted"\r\n\r\n■■■' }]);
  assert.throws(() => readCsv('name,text\na,"unfinished'));
  assert.throws(() => readCsv('name,text\na,b,c'));
  assert.throws(() => readCsv('name,name\na,b'));
});

// Optional full parity audit against the original supplied CSV (never needed in CI).
if (process.env.OPERATOR_STATS_CSV) {
  test('every imported level matches the supplied CSV across all eight stats', () => {
    const byId = new Map(operators.map(operator => [operator.internalName, operator]));
    const columns = { hp: 'max_hp', atk: 'attack', def: 'defense', res: 'resistance', redeploy: 'redeploy_time', dp: 'dp_cost', block: 'block_count', interval: 'attack_interval' };
    let count = 0;
    for (const row of readCsv(fs.readFileSync(process.env.OPERATOR_STATS_CSV!, 'utf8'))) {
      const operator = byId.get(row.character_id);
      if (!operator) continue;
      const phase = operator.stats!.phases.find(item => item.elite === Number(row.elite));
      assert(phase);
      const actual = getBaseStats(phase, Number(row.level));
      for (const key of STAT_KEYS) assert.equal(actual[key], Number(row[columns[key]]), `${operator.name} E${row.elite} L${row.level} ${key}`);
      count++;
    }
    assert.equal(count, 82090);
  });
}

test('a base skill icon follows the raw name while its heading drops the Replaces suffix', () => {
  // The scrape ran the "Replaces <older skill>" label onto the name with no separator.
  // The file on disk carries that raw string, so the icon must keep it and only the
  // displayed heading may be cleaned -- passing the cleaned name here was a silent 404.
  const raw = { name: 'SleepinessReplacesLaziness' };
  assert.equal(baseSkillDisplayName(raw), 'Sleepiness');
  assert.equal(decodeURIComponent(getBaseSkillIconPath('Durin', raw)!),
    '/base-skill-icons/Durin - SleepinessReplacesLaziness.webp');
  // Where base.tsx has already split the two apart, rawName wins for the filename.
  const split = { name: 'Sleepiness', rawName: 'SleepinessReplacesLaziness' };
  assert.equal(decodeURIComponent(getBaseSkillIconPath('Durin', split)!),
    '/base-skill-icons/Durin - SleepinessReplacesLaziness.webp');
  assert.equal(baseSkillDisplayName({ name: 'Metalwork α' }), 'Metalwork α');
});

test('Level 30 resolves to the Base tier icon, which is the only one that exists for it', () => {
  // 1★/2★ operators have no Elite path; a base skill tagged "Level 30" is Base's tier.
  assert.equal(getEssentialIconPath('Level 30'), '/essential-icons/Elite 0.webp');
  assert.equal(getEssentialIconPath('Base'), '/essential-icons/Elite 0.webp');
  assert.equal(getEssentialIconPath('Elite 2'), '/essential-icons/Elite 2.webp');
});

test('talent headings drop the scraped Replaces suffix while the raw name stays for lookups', () => {
  assert.equal(talentDisplayName('Tactical Configuration 2ReplacesTactical Configuration 1'), 'Tactical Configuration 2');
  assert.equal(talentDisplayName('Support of the LittleReplacesFast Deployment'), 'Support of the Little');
  assert.equal(talentDisplayName('Cold Front'), 'Cold Front');
});

test('potential replacement chains render as one talent while independent numbered talents stay separate', () => {
  const normalized = new Map(getAllOperators().map(operator => [operator.internalName, operator]));
  // Castle-3, Lancet-2, THRM-EX, and Rhodes Island Recon (CN-only).
  for (const id of ['char_286_cast3', 'char_285_medic2', 'char_376_therex', 'char_4215_buddy']) {
    const talents = normalized.get(id)?.talents;
    assert(talents, id);
    assert.equal(talents.length, 1, id);
    const talent = talents[0];
    assert(talent, id);
    assert.equal(talent.rows.length, 6, id);
    assert(!talent.name?.match(/(?:\s[1-6]|\s(?:I|II|III|IV|V|VI))$/), id);
    assert.deepEqual(talent.rows.map(row => row.name), Array.from({ length: 6 }, (_, index) => `${talent.name} ${index + 1}`), id);
  }

  assert.deepEqual(normalized.get(op('CONFESS-47').internalName)?.talents?.[0]?.rows.map(row => row.name),
    ['Pay-Per-Confession I', 'Pay-Per-Confession II', 'Pay-Per-Confession III', 'Pay-Per-Confession IV', 'Pay-Per-Confession V', 'Pay-Per-Confession VI']);

  // Distinct talents may share a base name and end in I/II (Mechanist's Integrated
  // Strategies talents do): with no "Replaces" marker in the source, none is merged.
  const base = (name: string) => name.split('Replaces')[0].trim().replace(/\s+(VI|IV|III|II|I|V|[1-6])$/, '').trim();
  let separate = 0;
  for (const raw of operators) {
    const groups = new Map<string, string[]>();
    for (const talent of (raw.talents ?? []) as unknown as { name?: string | null }[]) {
      if (talent.name) groups.set(base(talent.name), [...(groups.get(base(talent.name)) ?? []), talent.name]);
    }
    const names = new Set(normalized.get(raw.internalName)?.talents?.map(talent => talent.name));
    for (const group of groups.values()) {
      if (group.length < 2 || group.some(name => name.includes('Replaces'))) continue;
      separate++;
      for (const name of group) assert(names.has(name), `${raw.internalName}: ${name} was merged`);
    }
  }
  assert(separate > 0, 'the roster has independent talents that share a base name');
});

test('skill image URLs encode Unicode and URL delimiters before image optimization', () => {
  for (const [path, filename] of [
    [getBaseSkillIconPath('Thorns the Lodestar', { name: 'Metalwork α' }), '/base-skill-icons/Thorns the Lodestar - Metalwork α.webp'],
    [getSkillIconPath('Amiya', 'Tactical Chant γ'), '/skill-icons/Amiya - Tactical Chant γ.webp'],
  ]) {
    assert(path);
    assert(!/[^\x00-\x7f]/.test(path));
    assert.equal(decodeURIComponent(path), filename);
  }
  const path = getSkillIconPath('Test #1', 'A & B 50%');
  assert(path);
  assert.equal(new URL(path, 'http://localhost').hash, '');
  assert.equal(decodeURIComponent(path), '/skill-icons/Test #1 - A & B 50%.webp');
});

test('operator portraits preserve names through URL encoding for every rarity and future icons', () => {
  for (const operator of operators) {
    const icon = getOperatorIconPath(operator);
    const parsed = new URL(icon, 'http://localhost');
    assert(!/[^\x00-\x7f]/.test(icon), operator.name);
    assert.equal(parsed.hash, '');
    assert.equal(parsed.search, '');
    const name = operator.name.replace(/[\\/*?:"<>|]/g, '').trim();
    assert.equal(decodeURIComponent(parsed.pathname.split('/').pop()!), `${name} - Base.webp`);
  }
  assert.equal(getOperatorIconPath(op("Wiš'adel")), "/six-star-icons/Wi%C5%A1'adel%20-%20Base.webp");
  // An unpublished portrait is the server's call (isPortraitPending, against the
  // release's asset index); the browser only reads the flag it leaves on the record.
  assert.equal(getOperatorIconPath({ name: 'Test é #1 & 50%', rarity: 6 }), '/six-star-icons/Test%20%C3%A9%20%231%20%26%2050%25%20-%20Base.webp');
  assert.equal(getOperatorIconPath({ name: 'Test é #1 & 50%', rarity: 6, portraitPending: true }), OPERATOR_PORTRAIT_PLACEHOLDER);
  assert.equal(isPortraitPending({ name: 'Test é #1 & 50%', rarity: 6 }), true);
  assert.equal(isPortraitPending(op("Wiš'adel")), false);
  // Resolved once, where the records are loaded, and carried with them.
  for (const record of getAllOperators()) assert.equal(record.portraitPending ?? false, isPortraitPending(record), record.name);
});

test('operator quick search accepts plain spellings, accents, apostrophes and partial names', () => {
  for (const [query, expected] of [
    ['wisadel', "Wiš'adel"], ['WIŠ’ADEL', "Wiš'adel"], ['mlynar', 'Młynar'],
    [' MŁYNAR ', 'Młynar'], ['pozemka', 'Pozëmka'], ['kaltsit', "Kal'tsit"],
    ['chen', "Ch'en"], ['hoolheyak', "Ho'olheyak"], ['hv it', ''],
    ['hvit aska', 'Eyjafjalla the Hvít Aska'], ['wis', "Wiš'adel"],
  ]) {
    if (expected) assert(getOperatorSearchResults(operators, query).some(op => op.name === expected), query);
    else assert.deepEqual(getOperatorSearchResults(operators, query), []);
  }
  assert.deepEqual(getOperatorSearchResults([op('Młynar')], 'mlynar'), [op('Młynar')]);
  assert.deepEqual(getOperatorSearchResults(operators, '   '), []);
  assert.deepEqual(getOperatorSearchResults(operators, "'"), []);
  assert.deepEqual(getOperatorSearchResults(operators, 'not-an-operator-name'), []);
});

test('operator quick search ranks normalized prefixes first without mutating its input', () => {
  const candidates = [{name:'Franka'}, {name:'Ansel'}, {name:'Manticore'}, {name:'Andreana'}];
  assert.deepEqual(getOperatorSearchResults(candidates, 'an').map(op => op.name), ['Andreana', 'Ansel', 'Franka', 'Manticore']);
  assert.equal(candidates[0].name, 'Franka');
  assert.equal(getOperatorSearchResults(operators, 'a').length, 8);
});

test('operator quick search falls back to the bundled catalogue when a content release is incomplete', async () => {
  const requests: string[] = [];
  const fetcher = async (url: string) => {
    requests.push(url);
    if (url.includes('/release/')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ operators: [{ name: 'Botani', rarity: 5, isFuture: false }] }) };
  };
  assert.deepEqual(
    await loadOperatorSearch('https://example.test/release/public/operator-search.json', undefined, fetcher),
    [{ name: 'Botani', rarity: 5, isFuture: false }],
  );
  assert.deepEqual(requests, ['https://example.test/release/public/operator-search.json', '/operator-search.json']);
});

test('operator quick search does not retry the bundled catalogue against itself', async () => {
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    return { ok: false, status: 500, json: async () => ({}) };
  };
  await assert.rejects(() => loadOperatorSearch('/operator-search.json', undefined, fetcher), /returned 500/);
  assert.equal(requests, 1);
});

// Activation duration and the duration of a thrown unit are different game fields.
import { getSkillTiming, SkillTiming } from '../../lib/operators/skillTiming';
import SKILL_TIMINGS from '../../data/skill-timings.json';
import { getSkillList } from '../../lib/operators/operatorTypes';

test('Thorns the Lodestar displays level-specific target-effect durations', () => {
  const operator = op('Thorns the Lodestar');
  const timing = SKILL_TIMINGS.operators[operator.internalName as keyof typeof SKILL_TIMINGS.operators] as SkillTiming[][];
  const expected = [[5, 8], [10, 15], [18, 23]];
  getSkillList(operator).forEach((skill, index) => {
    for (const [levelIndex, seconds] of [[0, expected[index][0]], [9, expected[index][1]]]) {
      assert.deepEqual(getSkillTiming(skill.levels[levelIndex], skill, timing[index][levelIndex]), { label: 'Target effect', value: `${seconds}s` });
    }
  });
});

test('skill timings preserve finite and infinite durations without inventing missing data', () => {
  const skill = getSkillList(op('Thorns'))[2];
  const level = { ...skill.levels[9], description: null };
  assert.deepEqual(getSkillTiming({ ...level, duration: '∞' }, skill, { kind: 'instant' }), { label: 'Duration', value: '∞' });
  assert.deepEqual(getSkillTiming({ ...level, duration: 30 }, skill, { kind: 'effect', seconds: 5 }), { label: 'Duration', value: '30s' });
  assert.deepEqual(getSkillTiming({ ...level, duration: '–' }, skill, { kind: 'ammo' }), { label: 'Duration', value: 'Ammo-based' });
  assert.deepEqual(getSkillTiming({ ...level, duration: '–' }, skill, null), { label: 'Duration', value: '—' });
});

test('supplemental timings match the operator skill slots and level counts', () => {
  for (const operator of operators) {
    const timings = SKILL_TIMINGS.operators[operator.internalName as keyof typeof SKILL_TIMINGS.operators];
    if (!timings) continue;
    const skills = getSkillList(operator);
    assert.equal(timings.length, skills.length, operator.name);
    timings.forEach((levels, index) => {
      assert.equal(levels.length, skills[index].levels.length, `${operator.name} S${index + 1}`);
      for (const timing of levels) {
        if (timing && 'seconds' in timing) assert(typeof timing.seconds === 'number' && Number.isFinite(timing.seconds) && timing.seconds > 0);
      }
    });
  }
});

test('indefinite skills do not become instant when the scraped duration is empty', () => {
  for (const name of ['Fiammetta', 'Vina Victoria', 'Marcille']) {
    const skill = getSkillList(op(name)).find(skill => skill.levels.some(level => /Unlimited duration/i.test(level.description ?? '')))!;
    assert(skill, name);
    assert.deepEqual(getSkillTiming(skill.levels[0], skill, { kind: 'instant' }), { label: 'Duration', value: '∞' });
  }
});
