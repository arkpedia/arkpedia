/** Pure catalogue reconciliation. Display names are never used as source identities. */
import { localizeReleasedMechanics } from './sync-operator-english.mjs';
import { formatModuleAttributes } from './sync-module-stats.mjs';
import { stripRichText } from '../lib/gametext.mjs';
const list = x => Array.isArray(x) ? x : [];
const stableOrder = (previous, next) => [...list(previous).filter(n => next.includes(n)), ...next.filter(n => !list(previous).includes(n))];
const CLASSES = { WARRIOR: 'Guard', SNIPER: 'Sniper', TANK: 'Defender', MEDIC: 'Medic', SUPPORT: 'Supporter', CASTER: 'Caster', SPECIAL: 'Specialist', PIONEER: 'Vanguard' };
const STAT = { hp: 'maxHp', atk: 'atk', def: 'def', res: 'magicResistance', redeploy: 'respawnTime', dp: 'cost', block: 'blockCnt', interval: 'baseAttackTime' };
export const safeName = name => name.replace(/[\\/*?:"<>|]/g, '').trim();
export const rarityWord = n => ['', 'one', 'two', 'three', 'four', 'five', 'six'][n];
export const serverDay = (ts, offset = 8) => new Date((ts + offset * 3600) * 1000).toISOString().slice(0, 10).replaceAll('-', '/');
export const windowFor = (start, end, source) => ({ startAt: new Date(start * 1000).toISOString(), endAt: new Date((end + (end % 60 === 59 ? 1 : 0)) * 1000).toISOString(), timingSource: source });
export const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
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
export function reconcileOperators({ operators, cn, en, releases = new Map(), now = Date.now() }) {
  const next = structuredClone(operators), byId = new Map(next.map(op => [op.internalName, op]));
  const labels = learnedLabels(next, cn.characters), changes = [], renames = [];
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
    if (!safeName(name)) throw new Error(`Operator ${id} has no usable name`);
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
      for (const module of op.modules) {
        const equip=tables.modules.equipDict[module.moduleId], battle=tables.battleEquip?.[module.moduleId];
        if (module.type === 'Original' || !battle) continue;
        module.stages=battle.phases.map((phase,i)=>({ stage: `Stage ${i+1}`, attributesIncreased: formatModuleAttributes(phase.attributeBlackboard),
          effectLabel: 'Module effect', effectText: phase.parts.flatMap(part=>[
            ...list(part.overrideTraitDataBundle?.candidates).map(c=>stripRichText(c.overrideDescripton || c.additionalDescription)),
            ...list(part.addOrOverrideTalentDataBundle?.candidates).map(c=>[c.requiredPotentialRank ? `Potential ${c.requiredPotentialRank+1}` : '',stripRichText(c.upgradeDescription || c.description)].filter(Boolean).join(': ')),
          ]).filter(Boolean).join('\n'), cost: costs(equip.itemCost?.[String(i+1)],tables) }));
      }
    }
    if (!op.files?.length) throw new Error(`Operator ${id} has no published archive`);
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
  return { operators: next, changes, renames };
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
  // The gates above are the only thing between CN text and a Global page, and one that
  // misses a record fails here instead of showing Chinese on /skins.
  const leftovers = next.filter(s => globalIds.has(s.skinId) && ([s.name, s.code, s.description].some(chinese) || CN_RELEASE.test(s.release ?? '')));
  if (leftovers.length) throw new Error(`Global outfits still carry CN text or a CN release label: ${leftovers.map(s => `${s.model} / ${s.name}`).join(', ')}`);
  const unnamed = next.filter(s => !s.series);
  if (unnamed.length) throw new Error(`Outfits without a series cannot be filtered on /skins: ${unnamed.map(s => `${s.model} / ${s.name}`).join(', ')}`);
  return { skins: next, changes, renames };
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
export function reconcileCalendars({ events, banners, operators, cn, en, eventRows, bannerRows }) {
  const nextEvents = structuredClone(events), nextBanners = structuredClone(banners), media = [], renames = [];
  const names = new Map(operators.flatMap(op => [op.name, ...(op.aliases ?? [])].map(n => [fold(n), op])));
  const cnSource = cn.source, enSource = en.source;
  const alreadyGlobalEvents = new Set(events.filter(e => e.global?.dateRange).map(e => e.name));
  for (const row of eventRows) {
    if (!row.name || !dayPart(row.cnstart)) continue;
    const candidates = Object.values(cn.activity.basicInfo).filter(a => a.hasStage && serverDay(a.startTime) === dayPart(row.cnstart) && serverDay(a.endTime) === dayPart(row.cnend));
    if (candidates.length !== 1) continue; // Login campaigns cannot borrow a main event's identity.
    const source = candidates[0], global = en.activity.basicInfo[source.id];
    let event = nextEvents.find(e => e.activityId === source.id || (fold(e.name) === fold(row.name) && dayPart(e.cn?.dateRange) === dayPart(row.cnstart)));
    if (!event) {
      event = { name: `[${row.type || 'Event'}] ${row.name}`, year: Number(row.cnstart.slice(0, 4)), poster: `/event-poster/${safeName(row.name)}.webp`,
        cn: {}, global: { dateRange: null, note: 'Global release unannounced' }, tw: { dateRange: null, note: null } };
      media.push({ path: event.poster.slice(1), wikiFiles: [`CN ${row.name} banner.png`] }); nextEvents.push(event);
    }
    event.activityId = source.id;
    event.cn = { ...event.cn, dateRange: `${serverDay(source.startTime)}–${serverDay(source.endTime)}` };
    if (global) event.global = { ...event.global, dateRange: `${serverDay(global.startTime, -7)}–${serverDay(global.endTime, -7)}`, note: null, ...windowFor(global.startTime, global.endTime, enSource) };
  }
  for (const row of bannerRows) {
    if (['standard', 'kernel'].includes(row.type)) continue; // Dedicated regional importer.
    const start = dayPart(row.cnstart); if (!start) continue;
    const title = row.name || (row.type === 'orient' ? `Orienteering #${row.no}` : row.type === 'jo' ? `Joint Operation #${row.no}` : null);
    if (!title) throw new Error('Source banner has no identity');
    const sourceOperators = (row.operators || [row.operators1, row.operators2].filter(Boolean).join(',')).split(',').map(n => n.trim()).filter(Boolean);
    const lineup = sourceOperators.map(n => names.get(fold(n)));
    if (lineup.some(op => !op)) throw new Error(`${title}: unknown operator ${sourceOperators.filter((_, i) => !lineup[i]).join(', ')}`);
    if (!lineup.length && row.type !== 'kernel linkup') throw new Error(`${title}: missing lineup`);
    const candidates = cn.gacha.gachaPoolClient.filter(p => serverDay(p.openTime) === start && !['DOUBLE','CLASSIC_DOUBLE'].includes(p.gachaRuleType));
    let banner = nextBanners.find(b => (fold(b.name) === fold(title) || fold(b.name).includes(fold(title))) && dayPart(b.cn_date) === start);
    const client = candidates.length === 1 ? candidates[0] : candidates.find(p => p.gachaPoolId === banner?.cnPoolId);
    if (!client) { if (!banner) throw new Error(`${title}: no unambiguous official CN window`); continue; }
    if (!banner) banner = nextBanners.find(b=>b.cnPoolId===client.gachaPoolId);
    if (!banner) {
      banner = { name: ['jo','orient'].includes(row.type) ? title : `[${({celebration:'Celebration',carnival:'Carnival',festival:'Festival',crossover:'Crossover'})[row.type] || 'Headhunting'}] ${title}`, category: /celebration|carnival|festival|crossover/.test(row.type) ? 'limited' : 'special',
        year: Number(start.slice(0,4)), global_date: null, banner_image: `/headhunting-banner-images/${safeName(title)}.webp` };
      media.push({ path: banner.banner_image.slice(1), wikiFiles: [`CN ${title} banner.png`, `${title} banner.png`] }); nextBanners.push(banner);
    }
    banner.cnPoolId = client.gachaPoolId;
    banner.cn_date = `${serverDay(client.openTime)}–${serverDay(client.endTime)}`;
    // Keep confirmed CN announcement timestamps; calendar discovery adds days only.
    const limited = (row.limited || '').split(',');
    banner.six_stars = stableOrder(banner.six_stars, lineup.filter((op, i) => op.rarity === 6 && limited[i]?.trim() !== '2').map(op => op.name));
    banner.pull_type = /celebration|carnival|festival|crossover/.test(row.type) ? 'limited'
      : row.type === 'jo' ? 'joint' : row.type === 'orient' ? 'orienteering'
      : client.gachaRuleType === 'SINGLE' ? 'featured' : (banner.pull_type || 'unknown');
    banner.five_stars = stableOrder(banner.five_stars, lineup.filter(op => op.rarity === 5).map(op => op.name));
    banner.four_stars = stableOrder(banner.four_stars, lineup.filter(op => op.rarity === 4).map(op => op.name));
    banner.rate_up_six_stars = stableOrder(banner.rate_up_six_stars, lineup.filter((op, i) => op.rarity === 6 && limited[i]?.trim() === '2').map(op => op.name));
    const globalStart = dayPart(row.start || row.globalstart);
    const globalCandidates = globalStart ? en.gacha.gachaPoolClient.filter(p => serverDay(p.openTime,-7) === globalStart && p.gachaRuleType === client.gachaRuleType) : [];
    const pool = globalCandidates.find(p => fold(p.gachaPoolName) === fold(title)) || (globalCandidates.length === 1 ? globalCandidates[0] : null);
    if (pool) {
      const officialName=`${banner.name.match(/^\[[^\]]*\]\s*/)?.[0] || ''}${pool.gachaPoolName}`;
      // Existing Global titles are stable application keys, including rerun/edition suffixes.
      if (!banner.global_date && fold(banner.name)!==fold(officialName)) {
        banner.aliases=[...new Set([...(banner.aliases ?? []),banner.name])];
        renames.push([banner.name,officialName]);banner.name=officialName;
      }
      banner.globalPoolId = pool.gachaPoolId;
      banner.global_date = `${serverDay(pool.openTime,-7)}–${serverDay(pool.endTime,-7)}`;
      banner.global_window = windowFor(pool.openTime,pool.endTime,enSource);
    }
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
    if (global) event.global={...event.global,dateRange:`${serverDay(global.startTime,-7)}–${serverDay(global.endTime,-7)}`,note:null,...windowFor(global.startTime,global.endTime,enSource)};
  }
  return { events: nextEvents, banners: nextBanners, media, renames };
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
      const window = banner[`${region}_window`] || (pool ? windowFor(pool.openTime,pool.endTime,tables.source) : null);
      if (!window || !window.timingSource) continue;
      for (const name of [...(banner.six_stars ?? []),...(banner.five_stars ?? []),...(banner.four_stars ?? [])]) {
        if (banner.rate_up_six_stars?.includes(name)) continue;
        if (ids.has(name)) add(ids.get(name),region,Date.parse(window.startAt)/1000);
      }
    }
  }
  return releases;
}
