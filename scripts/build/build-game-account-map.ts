#!/usr/bin/env node
/**
 * Writes data/game-account-map.json: the game's own ids for each operator and module,
 * resolved to the planner's names and positions, for importing a Global account
 * (lib/planner/gameAccount.ts; the sign-in is lib/account-import).
 *
 * The account the game server sends names an operator by its character id
 * ("char_225_haak") and a module by its equipment id ("uniequip_003_haak"). Neither
 * is derivable from our names, so both are mapped here from the operator records and
 * the EN client's tables, and the content release carries the result (the planner's
 * 'game-account-map' table), so a new operator needs no redeploy.
 *
 *   - An operator: the record's internalName IS the character id. Every record has one.
 *   - A module: by its type code, not its position. The client lists an operator's
 *     modules in release order (Fiammetta's Y came before her X); the planner numbers
 *     them as the record does, X before Y. The record writes the code in front of the
 *     name ("ART-X: A Long Journey"), the client in typeName1/typeName2 ("ART", "X"),
 *     with the Greek letters spelled A, B and D. Names are no use: the record and the
 *     client translate some differently ("Memorial Light", "Commemorative Light").
 *   - A skill: by position, which the import reads masteries by. Checked here: every
 *     operator the EN client has must list the same skills, in the same order, as its
 *     record (all 412 did on 2026-10-01).
 *
 * Anything that does not line up fails the run, naming it, and the refresh keeps
 * yesterday's map (its stage). An import with a stale map only misses what is new.
 *
 * Re-run after an upstream refresh:  npx tsx scripts/build/build-game-account-map.ts
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const upstream = process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata';
const excel = path.join(upstream, 'en', 'gamedata', 'excel');
const OUTPUT = path.join(root, 'data', 'game-account-map.json');

interface RecordFile {
  name: string;
  rarity?: number;
  internalName?: string;
  modules?: { type?: string; name: string }[];
  skills?: { skillList?: { name?: string }[] };
}

export interface GameAccountMapFile {
  version: 1;
  /** character id -> the record's name, by equipment id the planner's module index, and
   *  whether the Global client has it (the account page's operator count). */
  /** formOf: for another form of one character (Amiya's Guard and Medic), the character id
   *  of its default form, so the account page counts the character once, as the game does. */
  chars: Record<string, { name: string; rarity: number; modules: Record<string, number>; global?: true; formOf?: string }>;
  /** The profile card's names (the account page): each business card style's, by id, and
   *  each medal's, from the EN client's display_meta_table and medal_table. */
  nameCards: Record<string, string>;
  medals: Record<string, string>;
}

const GREEK: Record<string, string> = { A: 'α', B: 'β', D: 'Δ' };
// This mirror writes an empty list as {} (Lancet-2's skills).
const list = <T>(value: T[] | Record<string, never> | null | undefined): T[] => (Array.isArray(value) ? value : []);
const norm = (text: string | undefined) => (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildGameAccountMap(
  records: RecordFile[],
  tables: {
    uniequip: { charEquip: Record<string, string[] | Record<string, never>>; equipDict: Record<string, { type?: string; typeName1?: string; typeName2?: string | null }> };
    characters: Record<string, { skills?: { skillId?: string | null }[] | Record<string, never> | null }>;
    skills: Record<string, { levels?: { name?: string }[] }>;
    displayMeta?: { nameCardV2Data?: { skinData?: Record<string, { name?: string }> } };
    /** data/operator-forms.json: each form's name and character id, and the default form. */
    forms?: Record<string, { forms?: { name: string; internalName?: string }[]; default?: string }>;
    medalTable?: { medalList?: { medalId?: string; medalName?: string }[] };
  },
): GameAccountMapFile {
  const problems: string[] = [];
  const chars: GameAccountMapFile['chars'] = {};
  for (const record of [...records].sort((a, b) => (a.internalName ?? '').localeCompare(b.internalName ?? ''))) {
    const id = record.internalName;
    if (!id) { problems.push(`${record.name} has no internalName`); continue; }
    if (chars[id]) { problems.push(`${record.name} and ${chars[id].name} share ${id}`); continue; }

    const codes = (record.modules ?? []).filter((module) => module.type !== 'Original')
      .map((module) => /^([A-Z]{2,4})-([^:\s]{1,3}):/.exec(module.name)?.slice(1, 3) ?? null);
    const modules: Record<string, number> = {};
    for (const equipId of list(tables.uniequip.charEquip[id])) {
      const equip = tables.uniequip.equipDict[equipId];
      if (!equip || equip.type === 'INITIAL') continue;
      const letter = equip.typeName2 ?? '';
      const matches = codes.flatMap((code, index) => (code && code[0] === equip.typeName1 && (code[1] === letter || code[1] === GREEK[letter]) ? [index] : []));
      if (matches.length === 1) modules[equipId] = matches[0];
      else problems.push(`${record.name}: the client's ${equipId} (${equip.typeName1}-${letter}) matches ${matches.length} of the record's modules (${codes.map((code) => code?.join('-') ?? '?').join(', ') || 'none'})`);
    }

    const character = tables.characters[id];
    if (character) {
      const game = list(character.skills).filter((skill) => skill.skillId).map((skill) => norm(tables.skills[skill.skillId!]?.levels?.[0]?.name));
      const ours = (record.skills?.skillList ?? []).map((skill) => norm(skill.name));
      if (game.join('|') !== ours.join('|')) problems.push(`${record.name}: the client's skills (${game.join(', ')}) are not the record's (${ours.join(', ')}), in order`);
    }
    chars[id] = { name: record.name, rarity: record.rarity ?? 1, modules, ...(character ? { global: true as const } : {}) };
  }
  for (const entry of Object.values(tables.forms ?? {})) {
    const base = entry.forms?.find((form) => form.name === entry.default)?.internalName;
    for (const form of entry.forms ?? []) {
      if (base && form.internalName && form.internalName !== base && chars[form.internalName]) chars[form.internalName].formOf = base;
    }
  }
  if (problems.length) throw new Error(`build-game-account-map: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  const nameCards = Object.fromEntries(Object.entries(tables.displayMeta?.nameCardV2Data?.skinData ?? {})
    .filter(([, skin]) => typeof skin?.name === 'string').map(([id, skin]) => [id, skin.name as string]).sort(([a], [b]) => a.localeCompare(b)));
  const medals = Object.fromEntries((tables.medalTable?.medalList ?? [])
    .filter((medal) => medal.medalId && medal.medalName).map((medal) => [medal.medalId as string, medal.medalName as string]).sort(([a], [b]) => a.localeCompare(b)));
  return { version: 1, chars, nameCards, medals };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  for (const file of ['uniequip_table.json', 'character_table.json', 'char_patch_table.json', 'skill_table.json', 'display_meta_table.json', 'medal_table.json']) {
    if (!fs.existsSync(path.join(excel, file))) {
      console.error(`Missing ${path.join(excel, file)}.\nRun scripts/sync/refresh-stage-data.sh to populate .cache/upstream, or set ARKPEDIA_EN.`);
      process.exit(1);
    }
  }
  const records = fs.readdirSync(path.join(root, 'data'))
    .filter((folder) => /^operators-[1-6]star$/.test(folder))
    .flatMap((folder) => fs.readdirSync(path.join(root, 'data', folder)).filter((file) => file.endsWith('.json'))
      .map((file) => readJson<RecordFile>(path.join(root, 'data', folder, file))));
  const patch = readJson<{ patchChars?: Record<string, { skills?: { skillId?: string | null }[] | Record<string, never> | null }> }>(path.join(excel, 'char_patch_table.json'));
  const map = buildGameAccountMap(records, {
    uniequip: readJson(path.join(excel, 'uniequip_table.json')),
    characters: { ...readJson<Record<string, { skills?: { skillId?: string | null }[] | Record<string, never> | null }>>(path.join(excel, 'character_table.json')), ...(patch.patchChars ?? {}) },
    skills: readJson(path.join(excel, 'skill_table.json')),
    displayMeta: readJson(path.join(excel, 'display_meta_table.json')),
    medalTable: readJson(path.join(excel, 'medal_table.json')),
    forms: fs.existsSync(path.join(root, 'data', 'operator-forms.json')) ? readJson(path.join(root, 'data', 'operator-forms.json')) : {},
  });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(map)}\n`);
  const modules = Object.values(map.chars).reduce((sum, char) => sum + Object.keys(char.modules).length, 0);
  console.log(`Wrote ${path.relative(root, OUTPUT)}: ${Object.keys(map.chars).length} operators, ${modules} modules, ${Object.keys(map.nameCards).length} card styles, ${Object.keys(map.medals).length} medals.`);
}
