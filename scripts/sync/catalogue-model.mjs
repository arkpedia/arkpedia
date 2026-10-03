/** Pure catalogue reconciliation. Display names are never used as source identities. */
import { localizeReleasedMechanics } from './sync-operator-english.mjs';
import { stripRichText } from '../lib/gametext.mjs';
const list = x => Array.isArray(x) ? x : [];
const stableOrder = (previous, next) => [...list(previous).filter(n => next.includes(n)), ...next.filter(n => !list(previous).includes(n))];
const CLASSES = { WARRIOR: 'Guard', SNIPER: 'Sniper', TANK: 'Defender', MEDIC: 'Medic', SUPPORT: 'Supporter', CASTER: 'Caster', SPECIAL: 'Specialist', PIONEER: 'Vanguard' };
const STAT = { hp: 'maxHp', atk: 'atk', def: 'def', res: 'magicResistance', redeploy: 'respawnTime', dp: 'cost', block: 'blockCnt', interval: 'baseAttackTime' };
export const safeName = name => name.replace(/[\\/*?:"<>|]/g, '').trim();
export const rarityWord = n => ['', 'one', 'two', 'three', 'four', 'five', 'six'][n];
export const serverDay = (ts, offset = 8) => new Date((ts + offset * 3600) * 1000).toISOString().slice(0, 10).replaceAll('-', '/');
/* A client window, taken over `previous` (the window on record, or null). While the times
   are the same the record keeps its timingSource: the source is the mirror at the run's pin,
   which moves whenever the mirror commits, and a record rewritten for that alone would make
   the day a new release (sync-event-windows.mjs follows the same rule). */
export const windowFor = (start, end, source, previous) => {
  const window = { startAt: new Date(start * 1000).toISOString(), endAt: new Date((end + (end % 60 === 59 ? 1 : 0)) * 1000).toISOString(), timingSource: source };
  return previous?.timingSource && previous.startAt === window.startAt && previous.endAt === window.endAt ? { ...window, timingSource: previous.timingSource } : window;
};
export const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
/* The words of a name, folded like fold() and sorted, so 'Misumi Uika' and 'Uika Misumi'
   (or 'Uika-Misumi') are one key. */
const wordsKey = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/\[[^\]]*\]/g, '')
  .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ');
/**
 * The operator record a wiki lineup names: `entries` pairs every name and alias a record
 * answers to with what the lookup returns for it. The same name first (fold: case, marks
 * and separators aside), then the same words in any order. The wiki writes a Japanese
 * collaboration's names in either order, and switched the MyGO!!!!! banner from 'Misumi
 * Uika, Togawa Sakiko, Wakaba Mutsumi' to 'Uika Misumi, ...' overnight, which kept that
 * banner's lineup quarantined (banner:LINKAGE_65_0_1, 2026-09-25). Only when one record
 * alone has those words: two records sharing them stay unmatched, and are reported.
 * Every lineup matcher goes through this (reconcileCalendars, sync-recurring-banners.mjs).
 */
export function lineupNameLookup(entries) {
  const exact = new Map(), words = new Map();
  for (const [name, value] of entries) {
    exact.set(fold(name), value);
    const key = wordsKey(name), held = words.get(key);
    words.set(key, held === undefined || held === value ? value : null);
  }
  return name => exact.get(fold(name)) ?? words.get(wordsKey(name)) ?? undefined;
}
const chinese = value => /\p{Script=Han}/u.test(value ?? '');
const sourceName = (character, global) => global ? character.name : character.appellation || character.name;
const stats = c => ({ phases: c.phases.map((p, elite) => ({ elite, minLevel: 1, maxLevel: p.maxLevel, rangeId: p.rangeId,
  base: Object.fromEntries(Object.entries(STAT).map(([k,v]) => [k,p.attributesKeyFrames[0].data[v]])),
  max: Object.fromEntries(Object.entries(STAT).map(([k,v]) => [k,p.attributesKeyFrames.at(-1).data[v]])) })),
  trust: Object.fromEntries(['hp','atk','def'].map(k => [k,c.favorKeyFrames.at(-1).data[STAT[k]]])) });
const costs = (entries, tables) => list(entries).map(e => ({ name: tables.items.items[e.id]?.name ?? e.id, quantity: e.count }));
function archives(id, tables) {
  return list(tables.handbook?.handbookDict?.[id]?.storyTextAudio).flatMap(group => list(group.stories).map(story => ({
    section: group.storyTitle, unlock: story.unLockString || (story.unLockType === 'DIRECT' ? 'Obtain the operator' : `${story.unLockType} ${story.unLockParam}`), description: stripRichText(story.storyText),
  })));
}
function learnedLabels(operators, characters) {
  const branches = new Map(), factions = new Map();
  for (const op of operators) {
    const c = characters[op.internalName]; if (!c) continue;
    if (op.branch) branches.set(c.subProfessionId, op.branch);
    if (op.faction) factions.set(c.teamId || c.groupId || c.nationId, op.faction);
  }
  return { branches, factions };
}
/* An operator the tables cannot describe -- no usable name, no archive text -- is held
   back on its own instead of stopping the catalogue: a new one is left out, an existing
   one keeps its previous version (next is a clone of operators, so a record keeps its
   index), and either is returned in `quarantine`. */
export function reconcileOperators({ operators, cn, en, releases = new Map(), now = Date.now() }) {
  const next = structuredClone(operators), byId = new Map(next.map(op => [op.internalName, op]));
  const labels = learnedLabels(next, cn.characters), changes = [], renames = [], quarantine = [];
  const hold = (id, name, isNew, why) => {
    quarantine.push({ key: `operator:${id}`, action: isNew ? 'omitted-new' : 'kept-previous',
      reason: `${name || id} (${id}) ${why}, so ${isNew ? 'it is left out' : 'its previous version is kept'}.` });
    if (isNew) return;
    const index = operators.findIndex(op => op.internalName === id);
    next[index] = structuredClone(operators[index]); byId.set(id, next[index]);
    for (let i = renames.length - 1; i >= 0; i--) if (renames[i][0] === next[index].name) renames.splice(i, 1);
    for (let i = changes.length - 1; i >= 0; i--) if (changes[i] === id) changes.splice(i, 1);
  };
  for (const [id, source] of Object.entries(cn.characters)) {
    if (!id.startsWith('char_') || source.isNotObtainable !== false) continue;
    let op = byId.get(id);
    const global = en.characters[id]?.isNotObtainable === false && !chinese(en.characters[id].name);
    const tables = { ...(global ? en : cn), items: { items: { ...cn.items?.items, ...en.items?.items } } }, character = tables.characters[id];
    const isNew = !op;
    // Refresh official Global text for a CN record by ID, including renamed operators.
    const promote = global && (op?.isFuture || op?.sourceRegion === 'CN');
    if (op && !global) op.sourceRegion = 'CN';
    // Backfill missing overview text even when a CN record already exists.
    // Only promote existing text when the official Global record becomes available.
    const profile = list(tables.handbook?.handbookDict?.[id]?.storyTextAudio)
      .find(group => ['Profile', '客观履历', '学生概况'].includes(group.storyTitle) && group.stories?.length === 1);
    const overview = profile && stripRichText(profile.stories[0].storyText);
    if (op && overview && (!op.review?.official || promote)) {
      op.review = { ...op.review, official: overview };
      if (!isNew && !promote) changes.push(id);
    }
    if (!isNew && !promote) continue;
    const name = sourceName(character, global);
    if (!safeName(name)) { hold(id, op?.name, isNew, `has no usable name in the ${global ? 'Global' : 'CN'} character table`); continue; }
    if (isNew) {
      const baseSkin = Object.values(cn.skins.charSkins).find(s => s.charId === id && !s.displaySkin?.skinName);
      op = { name, internalName: id, rarity: Number(source.rarity.replace('TIER_', '')), class: CLASSES[source.profession],
        branch: labels.branches.get(source.subProfessionId) ?? null, faction: labels.factions.get(source.teamId || source.groupId || source.nationId) ?? null,
        umbrellaFactions: [], connectedFactions: [], position: source.position === 'MELEE' ? 'Melee' : 'Ranged', tags: [], trait: null,
        howToObtain: null, alternate: null, potential: { levels: [], totalCost: [] }, promotion: [], skills: { skillList: [], skillCost: {} },
        talents: [], baseSkills: [], modules: [], skins: [], characterInfo: { Illustrator: baseSkin?.displaySkin?.drawerList?.join(' / ') ?? '', 'Release Date': '' },
        characterVoices: {}, otherLanguages: {}, basicInfo: {}, physicalExam: {}, stats: stats(character), isFuture: true,
      };
    }
    if (overview) op.review = { ...op.review, official: overview };
    const oldName = op.name;
    // The mechanics importer checks the regional name. Restore the public name afterwards.
    const mechanics = localizeReleasedMechanics({ ...op, name: character.name }, tables);
    Object.assign(op, mechanics, { name, sourceRegion: global ? 'Global' : 'CN', stats: stats(character) });
    if (oldName !== name) { renames.push([oldName, name]); op.aliases = [...new Set([...(op.aliases ?? []), oldName])]; }
    if (isNew || promote) {
      op.files = archives(id, tables);
      // Module stages come from localizeReleasedMechanics above (module-stages.mjs), as for every released operator.
    }
    if (!op.files?.length) { hold(id, name, isNew, `has no archive text in the ${global ? 'Global' : 'CN'} handbook table yet`); continue; }
    if (isNew) op.promotion = character.phases.slice(1).map((phase, i) => ({ tier: `Elite ${i + 1}`, upgrades: [], prerequisite: `Level ${character.phases[i].maxLevel}`,
      cost: [...costs(phase.evolveCost, tables), { name: 'LMD', quantity: tables.constants.evolveGoldCost[op.rarity-1][i] }] }));
    const release = releases.get(id);
    if (release?.cn) op.characterInfo['CN Release Date'] = serverDay(release.cn, 8);
    if (global && release?.global) {
      op.characterInfo['Release Date'] = serverDay(release.global, -7);
      op.releaseAt = new Date(release.global * 1000).toISOString();
      op.releaseIsEstimated = false;
      op.isFuture = release.global * 1000 > now;
    }
    op.otherLanguages = { ...op.otherLanguages, 'Simplified Chinese': source.name };
    if (isNew) { next.push(op); byId.set(id, op); }
    changes.push(id);
  }
  return { operators: next, changes, renames, quarantine };
}

/* The site's spelling of each outfit brand, keyed by the tables' brand ID, in the order
   the /skins dropdown lists them (lib/skins/skinSeriesConfig.ts ALL_SERIES, which a test
   holds equal to these values). The tables' brandCapitalName is ALL CAPS for 22 of the
   25 brands and brandName differs from these for six ("Collab Series", "0011/Tempest"),
   so neither can be written as-is. A brand not listed here still gets a readable,
   region-independent name: brandCapitalName is identical in the CN and EN tables. */
export const SKIN_SERIES = {
  sale: 'Test Collection', epoque: 'EPOQUE', nian: 'Made by 0011', whirlwind: '0011 Tempest', yun: '0011 Yun',
  marthe: 'MARTHE', summer: 'Coral Coast', witch: 'Witch Feast', winter: 'Cambrian', xmas: 'Icefield Messenger',
  wild: 'Vitafield', sweep: 'Pioneer', striker: 'Striker', boc: 'Bloodline of Combat', kitchen: 'Rhodes Kitchen',
  ghost: 'Dreambind Castle', race: 'Whistlewind', ambienceSynesthesia: 'Ambience Synesthesia', shining: 'Shining Steps',
  game: 'Achievement Star', iteration: 'Iteration Provident', unveiling: 'Unveiling of Devotion',
  sightseer: 'Misaligned Sightseer', breaker: 'Storyboard Breaker', crossover: 'Crossover',
};
const MINOR_WORDS = new Set(['a', 'an', 'and', 'by', 'for', 'in', 'of', 'on', 'the', 'to']);
const titleCase = text => text.toLowerCase().replace(/[\p{L}\p{N}]+/gu, (word, at) => at && MINOR_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1));
export const skinSeries = (brand, display) => SKIN_SERIES[brand?.brandId]
  ?? (brand?.brandCapitalName ? titleCase(brand.brandCapitalName) : display.skinGroupName?.replace(/\/[^/]*$/, '') || null);
/* An outfit blurb opens with its code line -- "EPOQUE Collection New Arrivals/Charm of the
   Tiles." -- which the catalogue shows as the code and keeps out of the description.
   A first sentence with no "/" outside brackets is prose, not a code (the Coral Coast
   swimsuits), and stays in the description. Measured on the live tables, the code ends
   with the outfit's own name for 415 of 416 EN and 453 of 453 CN slash lines. */
const CODE_END = /[。！？]|\.(?=\s|$)/u;
export function skinText(display) {
  const text = stripRichText(display.dialog || display.content || display.description);
  const end = CODE_END.exec(text);
  const code = end ? text.slice(0, end.index + (/[！？]/u.test(end[0]) ? 1 : 0)).trim() : '';
  if (!code.replace(/\[[^\]]*\]/g, '').includes('/')) return { code: null, description: text || null };
  return { code, description: text.slice(end.index + end[0].length).trim() || null };
}
const CN_RELEASE = /\[CN\]|\(CN\)/, CN_MARKER = /^\s*(?:\[CN\]|\(CN\))\s*/;
/* The event an outfit shipped with: the one whose activity opened at the outfit's getTime
   on that server. Only rows from the wiki's Upcoming page carry an activityId (11 of 202
   events), so an activity is matched to its record by the day it opened, and by name when
   two records open that day. Anything less certain keeps the existing label. */
function releaseEvent(events, activity, time, global) {
  const opened = Object.values(activity?.basicInfo ?? {}).filter(a => time && a.startTime === time);
  if (!opened.length) return null;
  const byId = events.filter(e => opened.some(a => a.id === e.activityId));
  if (byId.length === 1) return byId[0];
  const day = serverDay(time, global ? -7 : 8);
  const sameDay = events.filter(e => dayPart(e[global ? 'global' : 'cn']?.dateRange) === day);
  if (sameDay.length <= 1) return sameDay[0] ?? null;
  const named = sameDay.filter(e => opened.some(a => fold(a.name) === fold(e.name)));
  return named.length === 1 ? named[0] : null;
}

export function reconcileSkins({ skins, operators, cn, en, events = [] }) {
  const next = structuredClone(skins), byId = new Map(next.map(s => [s.skinId, s]));
  const roster = new Map(operators.map(op => [op.internalName, op]));
  const changes = [], renames = [], globalIds = new Set();
  const brandOf = (tables, group) => Object.values(tables.skins.brandList).find(b => b.groupList.some(g => g.skinGroupId === group));
  for (const [id, source] of Object.entries(cn.skins.charSkins)) {
    const op = roster.get(id.split('@')[0]) ?? roster.get(source.charId);
    if (!op || !id.includes('@') || !source.displaySkin?.skinName) continue;
    // Global means official English text, not only an English title over CN placeholders.
    const official = en.skins.charSkins[id]?.displaySkin;
    const global = !!official?.skinName && ![official.skinName, official.dialog || official.content].some(chinese);
    const regional = global ? en.skins.charSkins[id] : source, display = regional.displaySkin;
    if (global) globalIds.add(id);
    let skin = byId.get(id);
    const isNew = !skin;
    // Existing community translations remain useful until the Global table ships.
    if (skin && !global) skin.sourceRegion = 'CN';
    // Records that were already Global before this reconciler first ran never got a
    // sourceRegion, so any CN text or CN release label left on one also promotes it.
    const promote = global && (skin?.sourceRegion === 'CN' || CN_RELEASE.test(skin?.release ?? '') || [skin?.name, skin?.code, skin?.description].some(chinese));
    if (!isNew && !promote) continue;
    const brand = brandOf(global ? en : cn, display.skinGroupId);
    const event = releaseEvent(events, (global ? en : cn).activity, display.getTime, global);
    const text = skinText(display);
    // Art files are keyed by the name, so a difference of case or punctuation alone
    // ("Charm of The Tiles") is not worth a rename, new artwork and a stranded old file.
    const name = skin && fold(skin.name) === fold(display.skinName) ? skin.name : display.skinName;
    const oldKey = skin ? `${skin.model} / ${skin.name}` : null;
    skin = { ...skin, skinId: id, name, model: op.name, series: skinSeries(brand, display),
      // A CN code stays until Global replaces it; the EN table's own code line, or none.
      seriesImage: skin?.seriesImage ?? null, code: global || isNew ? text.code : skin?.code ?? null, illustrator: display.drawerList?.join(' / ') || null,
      description: text.description,
      // Global labels name the event alone ("People, A People"), CN ones add the marker.
      release: event ? `${global ? '' : '[CN] '}${event.name.replace(/^\[[^\]]*\]\s*/, '')}`
        : (global ? skin?.release?.replace(CN_MARKER, '') : skin?.release) ?? null,
      howToObtain: skin?.howToObtain || (regional.isBuySkin ? 'Outfit Store' : (global ? display.obtainApproach : null)),
      image: `/${rarityWord(op.rarity)}-star-skins/${safeName(op.name)} - ${safeName(name)}.webp`,
      sourceRegion: global ? 'Global' : 'CN', cnReleaseAt: source.displaySkin.getTime || null,
      ...(global ? { globalReleaseAt: display.getTime || null } : {}),
    };
    if (oldKey && oldKey !== `${skin.model} / ${skin.name}`) {
      renames.push([oldKey, `${skin.model} / ${skin.name}`]);
      skin.searchAliases = [...new Set([...(skin.searchAliases ?? []), oldKey])];
    }
    if (isNew) next.push(skin); else next[next.findIndex(s => s.skinId === id)] = skin;
    byId.set(id, skin); changes.push(id);
  }
  // One spelling per series, whoever wrote the record: "AMBIENCE SYNESTHESIA" and a
  // hand-typed "0011/Yun" are the same series as the dropdown's "Ambience Synesthesia"
  // and "0011 Yun". A record with no series takes its brand's.
  const spellings = new Map(Object.values(SKIN_SERIES).map(name => [fold(name), name]));
  for (const skin of next) {
    const source = cn.skins.charSkins[skin.skinId]?.displaySkin;
    const series = spellings.get(fold(skin.series)) ?? (skin.series || (source ? skinSeries(brandOf(cn, source.skinGroupId), source) : null));
    if (series && series !== skin.series) { skin.series = series; if (!changes.includes(skin.skinId)) changes.push(skin.skinId); }
  }
  // The gates above are the only thing between CN text and a Global page, and a record
  // one of them misses is caught here instead of showing Chinese on /skins; so is one
  // with no series, which /skins cannot filter. Either keeps its previous version (left
  // out if it is new) and is returned in `quarantine`, instead of failing the run. The
  // records keep their input order, so an index below skins.length is the input record.
  const quarantine = [], dropped = new Set(), handled = new Set();
  const fallBack = (index, why) => {
    const skin = next[index], key = `${skin.model} / ${skin.name}`;
    handled.add(index);
    const kept = index < skins.length;
    quarantine.push({ key: `outfit:${skin.skinId ?? key}`, action: kept ? 'kept-previous' : 'omitted-new',
      reason: `${key}: ${why}, so ${kept ? 'its previous version is kept' : 'it is left out'}.` });
    // The rename and change this run made for it did not happen.
    for (let i = renames.length - 1; i >= 0; i--) if (renames[i][1] === key) renames.splice(i, 1);
    for (let i = changes.length - 1; i >= 0; i--) if (changes[i] === skin.skinId) changes.splice(i, 1);
    if (kept) next[index] = structuredClone(skins[index]); else dropped.add(index);
  };
  next.forEach((s, i) => {
    if (globalIds.has(s.skinId) && ([s.name, s.code, s.description].some(chinese) || CN_RELEASE.test(s.release ?? ''))) fallBack(i, 'the Global outfit still carries CN text or a CN release label');
  });
  next.forEach((s, i) => { if (!handled.has(i) && !s.series) fallBack(i, 'it has no series, so /skins cannot filter it'); });
  return { skins: next.filter((_, i) => !dropped.has(i)), changes, renames, quarantine };
}

// ARKPEDIA_WIKI_BASE points every wiki reader somewhere else: a test server, or an
// unreachable host to rehearse an outage.
export const wikiBase = () => (process.env.ARKPEDIA_WIKI_BASE || 'https://arknights.wiki.gg').replace(/\/+$/, '');
// Every structured wiki page is read through these two. A moved page leaves a redirect
// behind, not a missing title, so the request follows it (redirects=1) and wikiText
// refuses what is still a redirect (a double one), instead of reading it as no rows.
// A refusal is not the end of the run: wiki-pages.mjs falls back to the last good read.
export const wikiParseUrl = page => `${wikiBase()}/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&redirects=1&format=json`;
// The wiki creates each year's banner page around mid-January (2026's came early, on
// 2025-12-24), so during January (UTC) a missing page for the current year only means it
// has no rows yet. From February on it is an error again, as is any other missing page:
// a renamed or deleted page must not pass as an empty year for eleven months; it is
// read from its last good copy and reported instead.
export function wikiText(page, response, now) {
  if (response.error?.code === 'missingtitle' && now.getUTCMonth() === 0 && page === `Headhunting/Banners/${now.getUTCFullYear()}`) return '';
  const text = response.parse?.wikitext?.['*'];
  if (!text) throw new Error(`Missing structured wiki page: ${page}`);
  if (/^\s*#redirect\b/i.test(text)) throw new Error(`Structured wiki page ${page} is still a redirect after redirects were followed: ${text.trim().split('\n')[0]}`);
  return text;
}
/** Strict line-based parsing of the wiki's structured calendar templates. */
export function parseWikiRows(text, template) {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...text.matchAll(new RegExp(`\\{\\{${escaped}\\s*([\\s\\S]*?)\\}\\}`, 'gi'))].map(match => {
    const row = {};
    for (const line of match[1].split('\n')) {
      const field = /^\s*\|\s*([^=]+?)\s*=\s*(.*?)\s*$/.exec(line);
      if (field) row[field[1].trim()] = field[2].trim();
    }
    return row;
  });
}
const dayPart = text => /\d{4}\/\d{2}\/\d{2}/.exec(text ?? '')?.[0];
/* Where a row that left an Upcoming page went, for wiki-pages.mjs to tell a move from a loss.
   The wiki moves a banner row to the yearly page of its Global year once Global dates the
   banner, and an event row off Event/Upcoming once Global schedules the event, which the
   Global client's activity table then carries. A row is known by its CN opening and closing
   days, as reconcileCalendars knows it; the rows date nothing else, so a date alone accounts
   for nothing. */
const sameCnDays = (row, start, end) => Boolean(dayPart(row.cnstart)) && dayPart(row.cnstart) === start && dayPart(row.cnend) === end;
export const onYearlyPage = yearlyRows => row => yearlyRows.some(other => sameCnDays(row, dayPart(other.cnstart), dayPart(other.cnend)));
export const inGlobalClient = (cn, en) => row => Object.values(cn.activity?.basicInfo ?? {})
  .some(activity => sameCnDays(row, serverDay(activity.startTime), serverDay(activity.endTime)) && Boolean(en.activity?.basicInfo?.[activity.id]));

/* A banner's identity is the client's gacha pool: cnPoolId on CN, globalPoolId on
   Global. The kinds below tell pools apart that open the same day, and match a pool to
   the record that describes it. The client names every Standard pool the same, and on
   CN a Joint Operation too, so NORMAL pools are told apart by name where they can be. */
const STANDARD_NAMES = new Set(['适合多种场合的强力干员', 'Rare Operators useful in all kinds of stages']);
/**
 * The instants at which a Standard pool of these tables closed. Standard pools follow
 * each other without a gap -- each opens the second the one before it ends (04:00, every
 * 14 days) -- so a pool that opens at one of them is the next Standard pool. On CN that
 * is the only thing that tells a Standard pool from a Joint Operation, which the client
 * names the same (适合多种场合的强力干员): in the 2026-09 table 152 pools so named continue
 * the chain -- every Standard pool but the very first, NORM_0_1_1 -- and none of the 23
 * Joint Operations does. Joint Operation #1 (NORM_4_0_4) opened at 04:00 on 2019-11-01,
 * a day into Standard pool NORM_4_0_3, whose window its record's cn_date names; the old
 * ['standard', 'joint'] let the record take the Standard pool.
 */
export function standardChain(pools) {
  return new Set(list(pools).filter(p => p.endTime && (p.gachaRuleType === 'DOUBLE'
    || (p.gachaRuleType === 'NORMAL' && STANDARD_NAMES.has(p.gachaPoolName?.trim())))).map(p => p.endTime + 1));
}
/** `chain` is standardChain() of the table the pool comes from. */
export function poolKinds(pool, chain) {
  const name = pool.gachaPoolName?.trim();
  switch (pool.gachaRuleType) {
    case 'DOUBLE': return ['standard'];
    case 'CLASSIC': case 'CLASSIC_DOUBLE': return ['kernel'];
    case 'FESCLASSIC': return ['kernel-locating'];
    case 'CLASSIC_ATTAIN': return ['celebration-kernel'];
    case 'ATTAIN': return ['celebration'];
    case 'SPECIAL': return ['orienteering'];
    case 'LIMITED': case 'LINKAGE': return ['limited'];
    case 'SINGLE': return ['featured'];
    case 'NORMAL':
      if (name === 'Joint Operation') return ['joint'];
      if (name === 'Rare Operators useful in all kinds of stages') return ['standard'];
      if (name === '适合多种场合的强力干员') return chain.has(pool.openTime) ? ['standard'] : ['joint'];
      if (name === 'The Front That Was') return ['front'];
      return ['featured', 'front'];
    default: return []; // BACKFLOW (returning players) and anything new
  }
}
// The pools the Global client names after the banner itself; every other kind shares one
// client name ("Joint Operation", "Orienteering Headhunting", the Standard pool's).
const NAMED_KINDS = ['featured', 'limited', 'celebration'];
export function bannerKind(banner) {
  if (/^Kernel Locating\b/i.test(banner.name)) return 'kernel-locating';
  if (/Celebration - Kernel/i.test(banner.name)) return 'celebration-kernel';
  if (banner.category === 'kernel' || banner.pull_type === 'kernel') return 'kernel';
  if (banner.category === 'standard_pool' || banner.pull_type === 'standard') return 'standard';
  if (banner.pull_type === 'joint') return 'joint';
  if (banner.pull_type === 'orienteering') return 'orienteering';
  if (banner.pull_type === 'celebration') return 'celebration';
  if (banner.pull_type === 'the front that was') return 'front';
  if (banner.category === 'limited' || banner.pull_type === 'limited') return 'limited';
  return 'featured';
}
export const POOL_REGIONS = { cn: { field: 'cn_date', id: 'cnPoolId', offset: 8 }, global: { field: 'global_date', id: 'globalPoolId', offset: -7 } };
export const poolWindow = (pool, offset) => `${serverDay(pool.openTime, offset)}–${serverDay(pool.endTime, offset)}`;
// "[Limited-Time] Never Gilded Rerun" and the client's "Never Gilded" are one name.
const bareName = name => fold(String(name ?? '').replace(/^(?:\s*\[[^\]]*\])+/, '').replace(/\s+rerun\s*$/i, '').replace(/\s*\(global\)\s*$/i, ''));
// A record's name, or one it was known by, is the name the client gives its pool. A record
// with no English name yet (Chinese, from the CN client) names no Global pool: taking one by
// window alone is the mislink this rule exists to prevent, so it is reported as a conflict
// until the wiki renames the record or it is known by the pool's name.
const namesPool = (banner, pool) => [banner.name, ...list(banner.aliases)].some(name => bareName(name) === bareName(pool.gachaPoolName));
/**
 * Which pool each record without an id for `region` describes, by window, kind and name:
 * the pool's server days equal to the record's cn_date or global_date (or, failing that,
 * its first day), of a kind the record can be (poolKinds), and -- for a Global pool the
 * client names after its banner -- under the record's own name. A Global window can be an
 * estimate, so the window alone would hand a featured pool to whichever record was
 * guessed into its days. Only one-to-one matches are links. An id already on a record is
 * never replaced. Everything else is returned, with the pool's openTime, for the caller
 * to report:
 *   ambiguous      several records fit one pool, or several pools one record
 *   disagreements  the one record the pool fits already records another pool
 *   conflicts      a named Global pool fits records by window and kind, none by name
 */
export function linkPools(banners, pools, region) {
  const { field, id, offset } = POOL_REGIONS[region];
  const recorded = new Set(banners.map(b => b[id]).filter(Boolean)), chain = standardChain(pools);
  const proposals = new Map(), ambiguous = [], disagreements = [], conflicts = [];
  for (const pool of pools) {
    const kinds = poolKinds(pool, chain);
    if (!kinds.length || recorded.has(pool.gachaPoolId) || !pool.openTime || !pool.endTime) continue;
    const window = poolWindow(pool, offset), start = serverDay(pool.openTime, offset);
    const fits = banners.map((b, i) => [b, i]).filter(([b]) => kinds.includes(bannerKind(b)));
    let candidates = fits.filter(([b]) => b[field] === window);
    if (!candidates.length) candidates = fits.filter(([b]) => dayPart(b[field]) === start);
    if (region === 'global' && kinds.some(kind => NAMED_KINDS.includes(kind))) {
      const named = candidates.filter(([b]) => namesPool(b, pool));
      if (candidates.length && !named.length) conflicts.push({ pool: pool.gachaPoolId, openTime: pool.openTime, window, poolName: pool.gachaPoolName.trim(), candidates: candidates.map(([b]) => b.name) });
      candidates = named;
    }
    if (candidates.length === 1) proposals.set(candidates[0][1], [...(proposals.get(candidates[0][1]) ?? []), pool]);
    else if (candidates.length) ambiguous.push({ pools: [pool.gachaPoolId], openTime: pool.openTime, window, candidates: candidates.map(([b]) => b.name) });
  }
  const links = [];
  for (const [index, matched] of proposals) {
    const banner = banners[index], openTime = Math.min(...matched.map(p => p.openTime));
    if (matched.length > 1) ambiguous.push({ pools: matched.map(p => p.gachaPoolId), openTime, window: banner[field], candidates: [banner.name], reason: 'several pools fit one record' });
    else if (banner[id]) disagreements.push({ banner: banner.name, recorded: banner[id], matched: matched[0].gachaPoolId, openTime, window: banner[field] });
    else links.push({ index, poolId: matched[0].gachaPoolId });
  }
  return { links, ambiguous, disagreements, conflicts };
}
/**
 * The quarantine entries for what linkPools could not decide, for pools that opened
 * within CREATE_WITHIN or have not opened yet: those are today's inputs, and on CN the
 * ones the client would otherwise publish. Older pools are the back catalogue, which
 * backfill-pool-ids.mjs lists for a person to settle once; reporting them every day
 * would keep the same history on the daily issue for good.
 */
export function poolQuarantine({ ambiguous, disagreements, conflicts }, region, nowSeconds) {
  const recent = item => item.openTime >= nowSeconds - CREATE_WITHIN;
  const server = region === 'cn' ? 'CN' : 'Global';
  // A CN pool no record takes is published from the client (reconcileCalendars); an
  // undecided one is not, so it is left out. On Global the records simply keep their
  // previous version.
  const action = region === 'cn' ? 'omitted-new' : 'kept-previous';
  return [
    ...ambiguous.filter(recent).map(a => ({ key: `banner:${a.pools[0]}`, action,
      reason: a.pools.length > 1
        ? `${server} pools ${a.pools.join(', ')} all fit ${a.candidates[0]} (${a.window}) by window and kind, so none of them is linked${region === 'cn' ? ' or published' : ''}.`
        : `${server} pool ${a.pools[0]} (${a.window}) fits ${a.candidates.length} banner records by window and kind (${a.candidates.join(' | ')}), so it is not linked${region === 'cn' ? ' or published' : ''}.` })),
    ...disagreements.filter(recent).map(d => ({ key: `banner:${d.matched}`, action: 'kept-previous',
      reason: `${server} pool ${d.matched} fits ${d.banner} (${d.window}) by window and kind, but that record is pool ${d.recorded}; the record is left as it is and ${d.matched} is not linked${region === 'cn' ? ' or published' : ''}.` })),
    ...conflicts.filter(recent).map(c => ({ key: `banner:${c.pool}`, action: 'kept-previous',
      reason: `${server} pool ${c.pool} "${c.poolName}" opens in the window of ${andList(c.candidates)} (${c.window}), which ${c.candidates.length > 1 ? 'are' : 'is'} named otherwise, so it is not linked; a date there may only be an estimate.` })),
  ];
}

/* Banners the catalogue creates from the CN client by itself, when no record holds the
   pool yet. The recurring Standard and Kernel pools belong to sync-recurring-banners.mjs;
   Kernel Locating, the anniversary Kernel and returning-player pools have no CN records. */
const CLIENT_BANNERS = {
  SINGLE: { pull_type: 'featured', category: 'special', label: 'Headhunting' },
  LIMITED: { pull_type: 'limited', category: 'limited', label: 'Limited' },
  LINKAGE: { pull_type: 'limited', category: 'limited', label: 'Crossover' },
  // Every Joint Operation and Orienteering pool has the same client name.
  NORMAL: { pull_type: 'joint', category: 'special', title: pool => `Joint Operation (${pool.gachaPoolId})` },
  SPECIAL: { pull_type: 'orienteering', category: 'special', title: pool => `Orienteering (${pool.gachaPoolId})` },
  ATTAIN: { pull_type: 'celebration', category: 'special' },
};
// A pool with no record is created only this long after it opens: enough to ride out a
// wiki outage, never enough to mint the history the bulk import left unlinked.
const CREATE_WITHIN = 30 * 86400;
// Fewer wiki event rows than this are too few to call a failure pattern.
const EVENT_ROWS_JUDGED = 4;
// The pool kinds a wiki row's type can be, to tell apart pools that open the same day.
const ROW_KINDS = { jo: ['joint'], orient: ['orienteering'], celebration: ['limited', 'celebration'], carnival: ['limited'], festival: ['limited'],
  crossover: ['limited'], linkup: ['limited'], special: ['featured'], rerun: ['featured'], 'kernel locating': ['kernel-locating'] };
const LIMITED_ROW = /celebration|carnival|festival|crossover/;
/** The six-stars the client itself names for a pool, or null where it names none. */
function clientSixStars(pool, roster) {
  const ids = pool.gachaRuleType === 'LIMITED' ? [pool.limitParam?.limitedCharId]
    : pool.gachaRuleType === 'LINKAGE' ? [pool.linkageParam?.guaranteeTarget6Char]
    : pool.gachaRuleType === 'ATTAIN' ? list(pool.dynMeta?.attainRare6CharList) : [];
  const names = ids.filter(Boolean).map(id => roster.get(id)?.name);
  return names.length && names.every(Boolean) ? names : null;
}
const andList = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0];
// A banner named after its pool (a Joint Operation from the client) is not named twice.
const withPool = (name, poolId) => (name.includes(poolId) ? name : `${name} (${poolId})`);

/**
 * Events and banners. The game tables are the identity: every banner record is keyed by
 * its pool (linkPools fills the ids), and a CN pool no record describes is created from
 * the client under its Chinese name. The wiki only enriches: its rows give the community
 * English name the site shows until Global names the banner, and the lineups the client
 * does not carry (featured, Joint Operation, Standard). A row that cannot be applied --
 * an operator no record knows, no lineup, no pool or several on its day -- never stops
 * the run; it is returned in `quarantine`, and the record is left out if it is new,
 * published without the missing piece, or kept at its previous lineup.
 */
export function reconcileCalendars({ events, banners, operators, cn, en, eventRows, bannerRows, now = Date.now() }) {
  const nextEvents = structuredClone(events), nextBanners = structuredClone(banners), media = [], renames = [], quarantine = [];
  const operatorNamed = lineupNameLookup(operators.flatMap(op => [op.name, ...(op.aliases ?? [])].map(n => [n, op])));
  const roster = new Map(operators.map(op => [op.internalName, op]));
  const cnSource = cn.source, enSource = en.source;
  const alreadyGlobalEvents = new Set(events.filter(e => e.global?.dateRange).map(e => e.name));
  const pools = list(cn.gacha?.gachaPoolClient), nowSeconds = Math.floor(now / 1000), today = serverDay(nowSeconds);
  let applied = 0;
  for (const row of eventRows) {
    if (!row.name || !dayPart(row.cnstart)) continue;
    const candidates = Object.values(cn.activity.basicInfo).filter(a => a.hasStage && serverDay(a.startTime) === dayPart(row.cnstart) && serverDay(a.endTime) === dayPart(row.cnend));
    if (candidates.length !== 1) continue; // Login campaigns cannot borrow a main event's identity.
    applied++;
    const source = candidates[0], global = en.activity.basicInfo[source.id];
    let event = nextEvents.find(e => e.activityId === source.id || (fold(e.name) === fold(row.name) && dayPart(e.cn?.dateRange) === dayPart(row.cnstart)));
    if (!event) {
      event = { name: `[${row.type || 'Event'}] ${row.name}`, year: Number(row.cnstart.slice(0, 4)), poster: `/event-poster/${safeName(row.name)}.webp`,
        cn: {}, global: { dateRange: null, note: 'Global release unannounced' }, tw: { dateRange: null, note: null } };
      media.push({ path: event.poster.slice(1), wikiFiles: [`CN ${row.name} banner.png`] }); nextEvents.push(event);
    }
    event.activityId = source.id;
    event.cn = { ...event.cn, dateRange: `${serverDay(source.startTime)}–${serverDay(source.endTime)}` };
    if (global) event.global = { ...event.global, dateRange: `${serverDay(global.startTime, -7)}–${serverDay(global.endTime, -7)}`, note: null, ...windowFor(global.startTime, global.endTime, enSource, event.global) };
  }
  // A single row can rightly match no activity (Contingency Contract is not one, a crossover
  // minigame has no stages) or carry a loose date ("Late September 2026"), so rows are not
  // reported one by one. Most of them failing is the page changing under the parser -- a
  // new date format, a renamed field -- which would otherwise stop every CN event from
  // being discovered without a word, as the zero-row check cannot see rows that parse.
  // The reasons name no day and no count: the rows dated on or before today grow day by
  // day, and data/quarantine.json is a release input, so either would make every day the
  // alert stands a new release.
  const dated = eventRows.filter(row => row.name && dayPart(row.cnstart)), opened = dated.filter(row => dayPart(row.cnstart) <= today);
  if (eventRows.length >= EVENT_ROWS_JUDGED && dated.length < eventRows.length / 2) {
    quarantine.push({ key: 'events:wiki-rows', action: 'kept-previous',
      reason: `Most event rows the wiki lists have no name or no YYYY/MM/DD CN start (e.g. "${eventRows.find(row => !dayPart(row.cnstart))?.cnstart ?? ''}"), so no CN event is discovered from them; the page's format has probably changed. Events keep their previous records.` });
  } else if (opened.length >= EVENT_ROWS_JUDGED && applied < opened.length / 2) {
    quarantine.push({ key: 'events:wiki-rows', action: 'kept-previous',
      reason: 'Most event rows the wiki dates to CN days already past match no single CN activity by its opening and closing days, so no CN event is discovered from them; the page\'s dates have probably changed form. Events keep their previous records.' });
  }
  // Pool ids first, so every step below finds a record by its pool.
  const linked = { cn: 0, global: 0 }, undecided = new Set();
  for (const [region, tables] of [['cn', cn], ['global', en]]) {
    const result = linkPools(nextBanners, list(tables.gacha?.gachaPoolClient), region);
    for (const { index, poolId } of result.links) { nextBanners[index][POOL_REGIONS[region].id] = poolId; linked[region]++; }
    quarantine.push(...poolQuarantine(result, region, nowSeconds));
    // A CN pool no record holds is published from the client below, unless a record
    // might be it: that would be a second, Chinese-named record of the same banner.
    if (region === 'cn') for (const id of [...result.ambiguous.flatMap(a => a.pools), ...result.disagreements.map(d => d.matched)]) undecided.add(id);
  }
  const holding = poolId => nextBanners.find(b => b.cnPoolId === poolId);
  const chain = standardChain(pools);
  for (const row of bannerRows) {
    if (['standard', 'kernel'].includes(row.type)) continue; // Dedicated regional importer.
    const start = dayPart(row.cnstart); if (!start) continue;
    const title = row.name || (row.type === 'orient' ? `Orienteering #${row.no}` : row.type === 'jo' ? `Joint Operation #${row.no}` : null);
    if (!title) {
      quarantine.push({ key: `banner:${row.type || 'untyped'} (CN ${start})`, action: 'omitted-new',
        reason: `A wiki banner row opening ${start} (CN) has no name, and its type (${row.type || 'none'}) gives it none, so it names no banner.` });
      continue;
    }
    const opening = pools.filter(p => serverDay(p.openTime) === start && !['DOUBLE', 'CLASSIC_DOUBLE'].includes(p.gachaRuleType));
    let banner = nextBanners.find(b => (fold(b.name) === fold(title) || fold(b.name).includes(fold(title))) && dayPart(b.cn_date) === start);
    // The row's type tells apart pools that open the same day (a featured and a returning-player pool).
    const fitting = opening.length > 1 && ROW_KINDS[row.type] ? opening.filter(p => poolKinds(p, chain).some(k => ROW_KINDS[row.type].includes(k))) : [];
    const candidates = fitting.length === 1 ? fitting : opening;
    const client = candidates.length === 1 ? candidates[0] : candidates.find(p => p.gachaPoolId === banner?.cnPoolId);
    if (!client) {
      // A row dated ahead of the CN client is simply not out yet.
      if (!banner && (opening.length > 1 || start <= today)) {
        quarantine.push({ key: `banner:${title} (CN ${start})`, action: 'omitted-new', reason: opening.length > 1
          ? `The wiki row "${title}" opens ${start} (CN), when ${opening.length} pools open (${opening.map(p => p.gachaPoolId).join(', ')}); which one it describes is unclear, so the row is not applied.`
          : `The wiki row "${title}" opens ${start} (CN), but no CN pool opens that day, so it is not published.` });
      }
      continue;
    }
    // The record holding the pool is the banner, whatever the wiki calls it.
    const holder = holding(client.gachaPoolId);
    if (holder) banner = holder;
    else if (banner?.cnPoolId) {
      quarantine.push({ key: `banner:${client.gachaPoolId}`, action: 'kept-previous',
        reason: `The wiki row "${title}" matches ${banner.name} by name and day, but that record is pool ${banner.cnPoolId} and the row's pool is ${client.gachaPoolId}; nothing is changed.` });
      continue;
    }
    const sourceOperators = (row.operators || [row.operators1, row.operators2].filter(Boolean).join(',')).split(',').map(n => n.trim()).filter(Boolean);
    const lineup = sourceOperators.map(operatorNamed);
    const unknown = sourceOperators.filter((_, i) => !lineup[i]);
    const wikiName = ['jo', 'orient'].includes(row.type) ? title : `[${({ celebration: 'Celebration', carnival: 'Carnival', festival: 'Festival', crossover: 'Crossover' })[row.type] || 'Headhunting'}] ${title}`;
    const category = LIMITED_ROW.test(row.type) ? 'limited' : 'special', art = `/headhunting-banner-images/${safeName(title)}.webp`;
    const isNew = !banner;
    if (isNew) {
      banner = { name: wikiName, category, year: Number(start.slice(0, 4)), global_date: null, banner_image: art };
      nextBanners.push(banner);
    } else if (banner.nameStatus === 'cn-official') {
      // Created from the client while the wiki had no row for it: the community English
      // name replaces the Chinese one, and its art can now be looked up.
      if (banner.name !== wikiName) {
        banner.aliases = [...new Set([...(banner.aliases ?? []), banner.name])];
        renames.push([banner.name, wikiName]); banner.name = wikiName;
      }
      banner.category = category;
      banner.banner_image ??= art;
    }
    if (isNew || banner.nameStatus === 'cn-official') banner.nameStatus = 'en-unofficial';
    // Planned for every record a row touches: assetPlan drops what is published, so art
    // the wiki had not uploaded yet is asked for again on each run until it lands.
    if (banner.banner_image?.startsWith('/headhunting-banner-images/')) media.push({ path: banner.banner_image.slice(1), wikiFiles: [`CN ${title} banner.png`, `${title} banner.png`] });
    banner.cnPoolId = client.gachaPoolId;
    banner.cn_date = `${serverDay(client.openTime)}–${serverDay(client.endTime)}`;
    // Keep confirmed CN announcement timestamps; calendar discovery adds days only.
    const clientSix = clientSixStars(client, roster);
    if (unknown.length || (!lineup.length && row.type !== 'kernel linkup')) {
      const why = unknown.length ? `its wiki lineup names ${andList(unknown)}, which no operator record matches` : 'its wiki row lists no operators';
      const partial = isNew || ['pending', 'client'].includes(banner.lineupSource);
      if (isNew) {
        Object.assign(banner, { six_stars: clientSix ?? [], five_stars: [], four_stars: [], rate_up_six_stars: [], lineupSource: clientSix ? 'client' : 'pending' });
      }
      quarantine.push({ key: `banner:${client.gachaPoolId}`, action: partial ? 'published-partial' : 'kept-previous',
        reason: `${withPool(banner.name, client.gachaPoolId)}: ${why}, so ${partial ? `it is published with ${clientSix ? 'the six-stars the client names' : 'its lineup pending'}` : 'its previous lineup is kept'}.` });
    } else {
      const limited = (row.limited || '').split(',');
      // The client's own six-stars are exact: they are featured whatever the row says.
      const rowSix = lineup.filter((op, i) => op.rarity === 6 && limited[i]?.trim() !== '2').map(op => op.name);
      const rateUpSix = lineup.filter((op, i) => op.rarity === 6 && limited[i]?.trim() === '2').map(op => op.name);
      banner.six_stars = stableOrder(banner.six_stars, [...rowSix, ...list(clientSix).filter(n => !rowSix.includes(n) && !rateUpSix.includes(n))]);
      banner.five_stars = stableOrder(banner.five_stars, lineup.filter(op => op.rarity === 5).map(op => op.name));
      banner.four_stars = stableOrder(banner.four_stars, lineup.filter(op => op.rarity === 4).map(op => op.name));
      banner.rate_up_six_stars = stableOrder(banner.rate_up_six_stars, rateUpSix);
      banner.lineupSource = 'wiki';
    }
    banner.pull_type = LIMITED_ROW.test(row.type) ? 'limited'
      : row.type === 'jo' ? 'joint' : row.type === 'orient' ? 'orienteering'
      : client.gachaRuleType === 'SINGLE' ? 'featured' : (banner.pull_type || 'unknown');
    const globalStart = dayPart(row.start || row.globalstart);
    const globalCandidates = globalStart ? list(en.gacha?.gachaPoolClient).filter(p => serverDay(p.openTime,-7) === globalStart && p.gachaRuleType === client.gachaRuleType) : [];
    const pool = globalCandidates.find(p => fold(p.gachaPoolName) === fold(title)) || (globalCandidates.length === 1 ? globalCandidates[0] : null);
    // A recorded id is never replaced, and one pool is never two banners.
    const globalHolder = pool && nextBanners.find(b => b !== banner && b.globalPoolId === pool.gachaPoolId);
    if (pool && (globalHolder || (banner.globalPoolId && banner.globalPoolId !== pool.gachaPoolId))) {
      quarantine.push({ key: `banner:${pool.gachaPoolId}`, action: 'kept-previous',
        reason: `The wiki row "${title}" dates its Global run to ${globalStart}, when Global pool ${pool.gachaPoolId} opens, but ${globalHolder ? `${globalHolder.name} already records that pool` : `${banner.name} is pool ${banner.globalPoolId}`}; ${banner.name} keeps its Global dates.` });
    } else if (pool) {
      const officialName=`${banner.name.match(/^\[[^\]]*\]\s*/)?.[0] || ''}${pool.gachaPoolName}`;
      // Existing Global titles are stable application keys, including rerun/edition suffixes.
      if (!banner.global_date && fold(banner.name)!==fold(officialName)) {
        banner.aliases=[...new Set([...(banner.aliases ?? []),banner.name])];
        renames.push([banner.name,officialName]);banner.name=officialName;banner.nameStatus='en-official';
      }
      banner.globalPoolId = pool.gachaPoolId;
      banner.global_date = `${serverDay(pool.openTime,-7)}–${serverDay(pool.endTime,-7)}`;
      banner.global_window = windowFor(pool.openTime,pool.endTime,enSource,banner.global_window);
    }
  }
  // A recent CN pool no record holds is a banner in its own right, wiki row or not: it is
  // published under the client's Chinese name, with the six-stars the client names or its
  // lineup pending, and the wiki fills it in when a row for its window appears.
  for (const pool of pools) {
    const spec = CLIENT_BANNERS[pool.gachaRuleType];
    if (!spec || !pool.openTime || !pool.endTime || pool.openTime < nowSeconds - CREATE_WITHIN || holding(pool.gachaPoolId)) continue;
    if (pool.gachaRuleType === 'NORMAL' && !poolKinds(pool, chain).includes('joint')) continue;
    // Reported by poolQuarantine: several records fit it, or one that records another pool.
    if (undecided.has(pool.gachaPoolId)) continue;
    const six = clientSixStars(pool, roster), cnName = pool.gachaPoolName?.trim() || pool.gachaPoolId;
    nextBanners.push({ name: spec.title?.(pool) ?? (spec.label ? `[${spec.label}] ${cnName}` : cnName), category: spec.category,
      year: Number(serverDay(pool.openTime).slice(0, 4)), global_date: null, banner_image: null, cnPoolId: pool.gachaPoolId,
      cn_date: `${serverDay(pool.openTime)}–${serverDay(pool.endTime)}`, six_stars: six ?? [], pull_type: spec.pull_type,
      five_stars: [], four_stars: [], rate_up_six_stars: [], lineupSource: six ? 'client' : 'pending', nameStatus: 'cn-official' });
  }
  // What the wiki has not supplied yet stays on the list until it does.
  for (const banner of nextBanners) {
    if (!banner.cnPoolId || (banner.nameStatus !== 'cn-official' && banner.lineupSource !== 'pending')) continue;
    const missing = [banner.nameStatus === 'cn-official' && 'an English name', banner.lineupSource === 'pending' && 'its rate-up lineup', !banner.banner_image && 'key art'].filter(Boolean);
    quarantine.push({ key: `banner:${banner.cnPoolId}`, action: 'published-partial',
      reason: `${withPool(banner.name, banner.cnPoolId)} is published from the CN client without ${andList(missing)}, which only a wiki row for its window supplies.` });
  }
  // Global launches leave the Upcoming wiki page. Reconcile previously discovered
  // activity IDs independently, so removal from that page cannot strand a CN record.
  for (const event of nextEvents) {
    const global=en.activity.basicInfo[event.activityId];
    if (global && !chinese(global.name)) {
      const officialName=`${event.name.match(/^\[[^\]]*\]\s*/)?.[0] || ''}${global.name}`;
      if (!alreadyGlobalEvents.has(event.name) && fold(event.name)!==fold(officialName)) {
        event.aliases=[...new Set([...(event.aliases ?? []),event.name])];
        renames.push([event.name,officialName]);event.name=officialName;
      }
    }
    if (global) event.global={...event.global,dateRange:`${serverDay(global.startTime,-7)}–${serverDay(global.endTime,-7)}`,note:null,...windowFor(global.startTime,global.endTime,enSource,event.global)};
  }
  return { events: nextEvents, banners: nextBanners, media, renames, quarantine, linked };
}

export function operatorReleaseDates(operators, banners, cn, en) {
  const releases = new Map(), ids = new Map(operators.flatMap(op => [op.name,...(op.aliases ?? [])].map(n => [n,op.internalName])));
  const add = (id, region, ts) => { const row = releases.get(id) ?? {}; row[region] = Math.min(row[region] ?? Infinity, ts); releases.set(id,row); };
  for (const [region,tables] of [['cn',cn],['global',en]]) {
    for (const mission of Object.values(tables.activity.missionData ?? {})) {
      const activity = tables.activity.basicInfo[mission.missionGroup];
      if (activity) for (const reward of mission.rewards ?? []) if (reward.type === 'CHAR') add(reward.id,region,activity.startTime);
    }
    for (const banner of banners) {
      const pool = region==='cn' && tables.gacha.gachaPoolClient.find(p=>p.gachaPoolId===banner.cnPoolId);
      const window = banner[`${region}_window`] || (pool ? windowFor(pool.openTime,pool.endTime,tables.source,null) : null);
      if (!window || !window.timingSource) continue;
      for (const name of [...(banner.six_stars ?? []),...(banner.five_stars ?? []),...(banner.four_stars ?? [])]) {
        if (banner.rate_up_six_stars?.includes(name)) continue;
        if (ids.has(name)) add(ids.get(name),region,Date.parse(window.startAt)/1000);
      }
    }
  }
  return releases;
}
