#!/usr/bin/env node
/**
 * Writes data/event-rewards.json: for each event, the rewards the Global game tables list for it
 * beyond its store, each group with the table it came from.
 *
 *   login        a sign-in event's daily rewards (activity_table CHECKIN_ONLY / CHECKIN_ALL_PLAYER /
 *                CHECKIN_VS), totalled and day by day
 *   banner-gift  a one-off login gift, such as the limited banner's ten-roll permit (LOGIN_ONLY)
 *   missions     the event's missions (activity_table missionData, by missionGroup)
 *   first-clear  what the event's stages give on their first clear (stage_table, dropType COMPLETE)
 *   pray         a draw login (Lucky Strips, PRAY_ONLY): the table has its rules, not its payouts
 *
 * From the official Global announcements (data/official-news/global, sync-official-news.mjs), each
 * section of an event's post belonging to that event:
 *
 *   packs          the packs sold for real money during the event, with their stated CONTENTS
 *   notice         a gift, mail, free-headhunting or draw section, as the post words it (prose,
 *                  never counted)
 *
 * And from building_data, the furniture sets the event's rewards are pieces of (or its post
 * names): every piece, and how the game says each is obtained (event reward, furniture store).
 *
 * Event stores stay where they are (the event records' `rewards`).
 *
 * Which event a table activity belongs to: the event's own activity is the one whose name is the
 * event's without its "[Side Story]"-style prefix and which opens on the event's Global start; a
 * login activity belongs to the event that opened most recently before it (the same grouping an
 * event's official announcement makes). Events with no Global date, or none the tables name, are
 * left out.
 *
 * Reads ARKPEDIA_EN (a checkout holding en/gamedata/excel), else .cache/upstream/en-gamedata.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { newsSections, parsePacks, postEventName, postWindow } from './official-news.mjs';

const LOGIN_TYPES = new Set(['CHECKIN_ONLY', 'CHECKIN_ALL_PLAYER', 'CHECKIN_VS']);
const SIDE_TYPES = new Set([...LOGIN_TYPES, 'LOGIN_ONLY', 'PRAY_ONLY']);
// The kinds a reward is, by the table's own item type: what the page groups and icons by.
const KIND = {
  MATERIAL: 'material', CARD_EXP: 'material', GOLD: 'currency', DIAMOND: 'currency', DIAMOND_SHD: 'currency',
  TKT_GACHA: 'permit', TKT_RECRUIT: 'permit', TKT_INST_FIN: 'permit', LIMITED_TKT_GACHA_10: 'permit',
  LINKAGE_TKT_GACHA_10: 'permit', CLASSIC_TKT_GACHA: 'permit', AP_SUPPLY: 'sanity', FURN: 'furniture',
  CHAR: 'operator', CHAR_SKIN: 'outfit', ACTIVITY_ITEM: 'event-item', VOUCHER_MGACHA: 'voucher',
  ITEM_PACK: 'material',
};
const list = value => (Array.isArray(value) ? value : []);
const fold = name => String(name ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/* A name as the tables and the event records both spell it: a rerun is "X - Rerun", "X -
   Retrospection" or "X - Retrospective" in the tables and "X Rerun" in the records, and a
   numbered run ("Trials for Navigator #3") is one name in the tables. */
const key = name => fold(String(name ?? '').replace(/#\s*\d+\s*$/, '').replace(/[\s:–-]*(rerun|retrospection|retrospective)\s*$/i, ''));
/** The event's name without its bracketed prefix: "[Side Story – Festival] Invitation to Wine". */
export const eventTitle = name => String(name ?? '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
/** The first Global window's start, as a UTC instant of its UTC-7 day. */
export function globalStart(event) {
  const match = String(event?.global?.dateRange ?? '').match(/(\d{4})\/(\d{2})\/(\d{2})/);
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) / 1000 + 7 * 3600 : null;
}

/** Names for a table reward: { name, count, kind, id }. */
export function rewardNamer(tables) {
  const items = tables.items?.items ?? {};
  const furniture = tables.building?.customData?.furnitures ?? {};
  const characters = tables.characters ?? {};
  const skins = tables.skins?.charSkins ?? {};
  return reward => {
    const { id, type } = reward;
    let name = items[id]?.name;
    if (type === 'FURN') name = furniture[id]?.name;
    if (type === 'CHAR') name = characters[id]?.name;
    if (type === 'CHAR_SKIN') {
      const skin = skins[id];
      name = skin ? `${characters[skin.charId]?.name ?? skin.charId} / ${skin.displaySkin?.skinName ?? id}` : null;
    }
    return { name: name ?? id, count: reward.count, kind: KIND[type] ?? 'other', id };
  };
}

/** Totals a list of rewards by id, in first-seen order. */
function total(rewards) {
  const byId = new Map();
  for (const reward of rewards) {
    const held = byId.get(reward.id);
    if (held) held.count += reward.count; else byId.set(reward.id, { ...reward });
  }
  return [...byId.values()];
}

/** The kind of a reward named only by its English name (a pack's CONTENTS): the item table's. */
function kindByName(tables) {
  const byName = new Map(Object.values(tables.items?.items ?? {}).map(item => [item.name, KIND[item.itemType] ?? KIND[item.classifyType] ?? null]));
  return name => byName.get(name) ?? (/headhunting permit/i.test(name) ? 'permit' : 'other');
}

const NOTICE = /GIFT|MAIL|FREE|LUCKY|SUPPLY|REWARD|COMPENSATION|STRIPS/;
const NOT_NOTICE = /PACK|LOGIN|SIGN-IN|SIGN IN|OUTFIT|HEADHUNTING OPEN|FURNITURE/;

/** The first CN window's start, as a UTC instant of its UTC+8 day. */
export function cnStart(event) {
  const match = String(event?.cn?.dateRange ?? '').match(/(\d{4})\/(\d{2})\/(\d{2})/);
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) / 1000 - 8 * 3600 : null;
}

/** A namer that names an id the Global tables know in English, and any other by `fallback`'s. */
function regionalNamer(primary, fallback) {
  const english = rewardNamer(primary);
  const local = fallback ? rewardNamer(fallback) : null;
  return reward => {
    const named = english(reward);
    return named.name === reward.id && local ? local(reward) : named;
  };
}

/*
 * One region's tables: each event's own activity, the sign-ins, gifts and draws that belong to it,
 * and its missions and first clears. `match` finds an event's own activity among those opening
 * near `startOf(event)`.
 */
function tableGroups(events, tables, { startOf, match, name, region }) {
  const activity = tables.activity;
  const info = activity.basicInfo ?? {};
  const day = seconds => new Date(seconds * 1000).toISOString();
  const tag = region === 'CN' ? { region: 'CN' } : {};
  const src = text => (region === 'CN' ? `CN ${text}` : text);
  const own = [];
  const ownSide = new Map();
  const near = (entry, start) => Math.abs(entry.startTime - start) <= 2 * 86400;
  for (const event of events) {
    const start = startOf(event);
    if (start == null) continue;
    const opened = Object.values(info).filter(entry => near(entry, start));
    const found = match(event, opened, start);
    if (found) { own.push({ event, activity: found }); continue; }
    // An event that is a sign-in of its own ("2021 Login Event", "Lifestyle Aid"): the one
    // sign-in that opens on its start.
    const logins = opened.filter(entry => LOGIN_TYPES.has(entry.type) && Math.abs(entry.startTime - start) <= 86400);
    if (logins.length === 1) { own.push({ event, activity: logins[0] }); ownSide.set(logins[0].id, event); }
  }
  own.sort((a, b) => a.activity.startTime - b.activity.startTime);
  const result = {};
  const groupsOf = entry => (result[entry.event.name] ??= { activity: entry.activity.id, ...tag, groups: [] }).groups;
  // The event a side activity belongs to: the latest one opened at or before it, still running.
  const ownerOf = side => own.filter(entry => entry.activity.startTime <= side.startTime && side.startTime < entry.activity.endTime).at(-1);
  const titleOf = id => activity.homeActConfig?.[id]?.actTopBarText || info[id]?.name;
  for (const side of Object.values(info).filter(entry => SIDE_TYPES.has(entry.type)).sort((a, b) => a.startTime - b.startTime)) {
    const owner = ownSide.has(side.id) ? own.find(entry => entry.activity.id === side.id) : ownerOf(side);
    if (!owner) continue;
    const base = { title: titleOf(side.id), source: src(`activity_table ${side.id}`), start: day(side.startTime), end: day(side.endTime), ...tag };
    if (LOGIN_TYPES.has(side.type)) {
      const data = activity.activity?.[side.type]?.[side.id];
      const daily = Object.values(data?.checkInList ?? {}).sort((a, b) => a.order - b.order).map(entry => list(entry.itemList).map(name));
      if (!daily.length) continue;
      groupsOf(owner).push({ kind: 'login', ...base, days: daily.length, items: total(daily.flat()), daily });
    } else if (side.type === 'LOGIN_ONLY') {
      const items = list(activity.activity?.LOGIN_ONLY?.[side.id]?.itemList).map(name);
      if (items.length) groupsOf(owner).push({ kind: 'banner-gift', ...base, items });
    } else if (side.type === 'PRAY_ONLY') {
      const rules = activity.dynActs?.[side.id];
      groupsOf(owner).push({ kind: 'pray', ...base, items: [], rules: [rules?.rule1, rules?.rule2].filter(Boolean) });
    }
  }
  for (const entry of own) {
    const id = entry.activity.id;
    const missions = list(activity.missionData).filter(mission => mission.missionGroup === id);
    const missionRewards = total(missions.flatMap(mission => list(mission.rewards)).map(name));
    if (missionRewards.length) groupsOf(entry).push({ kind: 'missions', title: 'Event missions', source: src(`activity_table missionData ${id}`), count: missions.length, items: missionRewards, ...tag });
    // The event's stages: by their zone's activity, or by their id for an original whose stages a
    // rerun's zones have since taken over (act15side's are in act15sre's zones).
    const zones = activity.zoneToActivity ?? {};
    const stages = Object.values(tables.stages?.stages ?? {}).filter(stage => zones[stage.zoneId] === id || String(stage.stageId).startsWith(`${id}_`));
    const firstClear = stages.flatMap(stage => list(stage.stageDropInfo?.displayDetailRewards)
      .filter(reward => reward.dropType === 'COMPLETE' && reward.type !== 'ACTIVITY_ITEM').map(reward => name({ ...reward, count: reward.count ?? 1 })));
    if (firstClear.length) {
      groupsOf(entry).push({ kind: 'first-clear', title: 'Event stage first clears', source: src(`stage_table ${id}`), count: stages.filter(stage => list(stage.stageDropInfo?.displayDetailRewards).some(r => r.dropType === 'COMPLETE' && r.type !== 'ACTIVITY_ITEM')).length, items: total(firstClear), ...tag });
    }
  }
  return result;
}

/** Which kinds a rerun takes from its original run until its own appear: what a rerun repeats. */
const RERUN_REPEATS = new Set(['missions', 'first-clear', 'furniture-set']);

/**
 * @param cn the CN tables ({ activity, stages, items, building, characters, skins }), or null: an
 *   event Global has not had yet is built from them, in the CN client's words where Global has no
 *   name for an item (2026-10-03: "CN only stuff you can keep in CN till global release").
 */
export function buildEventRewards(events, tables, posts, cn) {
  if (!Array.isArray(posts) || cn === undefined) throw new Error('buildEventRewards needs the posts ([] for none) and the CN tables (null for none)');
  const name = rewardNamer(tables);
  // Global: its own activity has the event's name and opens on its Global start; a rerun's
  // "Retrospection" and a numbered run's "#3" are the same name.
  const result = tableGroups(events, tables, {
    startOf: globalStart, name, region: 'Global',
    match: (event, opened) => {
      const title = key(eventTitle(event.name));
      return opened.find(entry => !SIDE_TYPES.has(entry.type) && key(entry.name) === title)
        ?? opened.find(entry => !SIDE_TYPES.has(entry.type) && title.length >= 6 && key(entry.name).startsWith(title));
    },
  });
  // CN, for an event Global has not had yet (no Global date, or one still ahead): the CN tables'
  // names are Chinese, so its own activity is the one event of its kind opening on its CN start.
  if (cn) {
    const now = Date.now() / 1000;
    const pending = events.filter(event => !result[event.name] && !String(event.name).startsWith('[Rerun]') && (globalStart(event) ?? Infinity) > now);
    const cnResult = tableGroups(pending, cn, {
      startOf: cnStart, name: regionalNamer(tables, cn), region: 'CN',
      match: (event, opened, start) => {
        const candidates = opened.filter(entry => !SIDE_TYPES.has(entry.type) && Math.abs(entry.startTime - start) <= 86400);
        return candidates.length === 1 ? candidates[0] : null;
      },
    });
    Object.assign(result, cnResult);
  }
  // The official announcements: each post's sections belong to the event it announces, the one
  // opening on the post's first DURATION whose name the post's title carries.
  const kindOf = kindByName(tables);
  const dated = events.map(event => ({ event, start: globalStart(event), title: fold(eventTitle(event.name)) })).filter(entry => entry.start != null);
  const themesNamed = new Map();
  for (const post of posts) {
    const window = postWindow(post.lines ?? []);
    if (!window) continue;
    const start = Date.parse(window.start) / 1000;
    const named = fold(postEventName(post.title));
    const entry = dated.find(candidate => Math.abs(candidate.start - start) <= 1.5 * 86400 && named && (candidate.title.includes(named) || named.includes(candidate.title)));
    if (!entry) continue;
    const groups = (result[entry.event.name] ??= { activity: null, groups: [] }).groups;
    for (const section of newsSections(post.lines ?? [])) {
      if (/PACK/.test(section.title)) {
        const packs = parsePacks(section).map(pack => ({ ...pack, contents: pack.contents.map(item => ({ ...item, kind: kindOf(item.name) })) }));
        if (packs.length) groups.push({ kind: 'packs', title: section.title, source: post.url, items: [], packs });
      } else if (NOTICE.test(section.title) && !NOT_NOTICE.test(section.title)) {
        const lines = section.lines.filter(line => /^(DURATION|DETAILS|REWARDS?|NOTE|HOW TO OBTAIN):/.test(line)).slice(0, 8);
        if (lines.length) groups.push({ kind: 'notice', title: section.title, source: post.url, items: [], lines });
      }
      const set = section.title.match(/FURNITURE SET\s*[–—:-]\s*(.+)$/);
      if (set) (themesNamed.get(entry.event.name) ?? themesNamed.set(entry.event.name, new Set()).get(entry.event.name)).add(fold(set[1]));
    }
  }
  // Furniture sets: the themes of the furniture an event's rewards include, or that its post names.
  // The Global names first; a set Global has not had yet in the CN client's.
  const furniture = { ...cn?.building?.customData?.furnitures, ...tables.building?.customData?.furnitures };
  const themes = { ...cn?.building?.customData?.themes, ...tables.building?.customData?.themes };
  for (const [eventName, entry] of Object.entries(result)) {
    const ids = new Set(entry.groups.flatMap(group => group.items).filter(item => item.kind === 'furniture').map(item => furniture[item.id]?.themeId).filter(Boolean));
    for (const theme of Object.values(themes)) if (themesNamed.get(eventName)?.has(fold(theme.name))) ids.add(theme.id);
    for (const themeId of ids) {
      const theme = themes[themeId];
      if (!theme) continue;
      const pieces = Object.values(furniture).filter(piece => piece.themeId === themeId).sort((a, b) => (a.sortId ?? 0) - (b.sortId ?? 0))
        .map(piece => ({ name: piece.name, id: piece.id, obtain: piece.obtainApproach ?? null, comfort: piece.comfort ?? null }));
      const global = Boolean(tables.building?.customData?.themes?.[themeId]);
      entry.groups.push({ kind: 'furniture-set', title: theme.name, source: `${global ? '' : 'CN '}building_data ${themeId}`, items: [], description: theme.desc ?? null, pieces, ...(global ? {} : { region: 'CN' }) });
    }
  }
  // A rerun repeats its original run's stages, missions and furniture: until the tables carry the
  // rerun's own, it shows the original's, marked as such. Never its store: a rerun has a store of
  // its own (tokens for the operator, other stock).
  for (const event of events.filter(e => /^\[Rerun\]/.test(e.name) || / Rerun$/.test(e.name))) {
    const title = key(eventTitle(event.name));
    const original = events.filter(e => e !== event && !/^\[Rerun\]/.test(e.name) && key(eventTitle(e.name)) === title)
      .sort((a, b) => (globalStart(a) ?? cnStart(a) ?? 0) - (globalStart(b) ?? cnStart(b) ?? 0))[0];
    if (!original) continue;
    const entry = (result[event.name] ??= { activity: null, groups: [] });
    entry.inheritsFrom = original.name;
    const have = new Set(entry.groups.map(group => group.kind));
    for (const group of result[original.name]?.groups ?? []) {
      if (RERUN_REPEATS.has(group.kind) && !have.has(group.kind)) entry.groups.push({ ...group, inherited: original.name });
    }
  }
  return result;
}

/**
 * English names for the event stores' Chinese item names: the wiki import named some furniture
 * pieces and items as the CN client does ("“烛火之中”"). The CN and Global tables share their ids,
 * so a CN name the Global table also has becomes the Global name; one Global does not have yet
 * stays Chinese until it does (2026-10-03: CN-only content stays in CN until Global ships it).
 */
/** The event stores' item names that are furniture pieces in either client (the summary's Furniture
 *  row: the wiki import's store lists them as plain items). */
export function storeFurnitureNames(events, cn, en) {
  const pieces = new Set([...Object.values(cn.building?.customData?.furnitures ?? {}), ...Object.values(en.building?.customData?.furnitures ?? {})].map(piece => piece.name));
  const names = new Set();
  for (const event of events) {
    for (const store of Array.isArray(event.rewards) ? event.rewards : event.rewards ? [event.rewards] : []) {
      for (const item of store.items ?? []) if (pieces.has(item.name)) names.add(item.name);
    }
  }
  return [...names].sort();
}

export function storeNameTranslations(events, cn, en) {
  const byCnName = new Map([
    ...Object.entries(cn.building?.customData?.furnitures ?? {}).map(([id, piece]) => [piece.name, en.building?.customData?.furnitures?.[id]?.name]),
    ...Object.entries(cn.items?.items ?? {}).map(([id, item]) => [item.name, en.items?.items?.[id]?.name]),
  ].filter(([, english]) => english));
  const names = {};
  for (const event of events) {
    for (const store of Array.isArray(event.rewards) ? event.rewards : event.rewards ? [event.rewards] : []) {
      for (const item of store.items ?? []) if (/\p{Script=Han}/u.test(item.name) && byCnName.has(item.name)) names[item.name] = byCnName.get(item.name);
    }
  }
  return names;
}

async function main() {
  const root = process.cwd();
  const excel = path.join(process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata', 'en', 'gamedata', 'excel');
  const read = file => JSON.parse(fs.readFileSync(path.join(excel, file), 'utf8'));
  const events = fs.readdirSync(path.join(root, 'data/events')).filter(file => /^events_\d+\.json$/.test(file))
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(root, 'data/events', file), 'utf8')));
  const newsDir = path.join(root, 'data/official-news/global');
  const posts = fs.existsSync(newsDir) ? fs.readdirSync(newsDir).filter(file => /^\d+\.json$/.test(file)).sort()
    .map(file => JSON.parse(fs.readFileSync(path.join(newsDir, file), 'utf8'))) : [];
  const cnExcel = path.join(process.env.ARKPEDIA_CN || '.cache/upstream/cn-resource', 'gamedata', 'excel');
  const readCn = file => JSON.parse(fs.readFileSync(path.join(cnExcel, file), 'utf8'));
  const rewards = buildEventRewards(events, {
    activity: read('activity_table.json'), stages: read('stage_table.json'), items: read('item_table.json'),
    building: read('building_data.json'), characters: read('character_table.json'), skins: read('skin_table.json'),
  }, posts, {
    activity: readCn('activity_table.json'), stages: readCn('stage_table.json'), items: readCn('item_table.json'),
    building: readCn('building_data.json'), characters: readCn('character_table.json'), skins: readCn('skin_table.json'),
  });
  const storeNames = storeNameTranslations(events, { building: readCn('building_data.json'), items: readCn('item_table.json') }, { building: read('building_data.json'), items: read('item_table.json') });
  const storeFurniture = storeFurnitureNames(events, { building: readCn('building_data.json') }, { building: read('building_data.json') });
  const out = { storeFurniture, about: 'Rewards the game tables and official announcements list for each event beyond its store: the Global tables, the CN ones for an event Global has not had yet, and a rerun its original run\'s until its own appear (scripts/build/build-event-rewards.mjs). Generated every refresh: do not edit.', storeNames, events: rewards };
  const file = path.join(root, 'data/event-rewards.json');
  const text = `${JSON.stringify(out, null, 1)}\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
  console.log(`Event rewards: ${Object.keys(rewards).length} events, ${Object.values(rewards).reduce((n, e) => n + e.groups.length, 0)} groups.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
