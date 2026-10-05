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
import { decodeEntities, newsSections, parseDuration, parsePacks, postEventName, postWindow } from './official-news.mjs';
import { readOfficialNews } from '../sync/sync-official-news.mjs';

const LOGIN_TYPES = new Set(['CHECKIN_ONLY', 'CHECKIN_ALL_PLAYER', 'CHECKIN_VS']);
/* Logins the tables name and date but give no rewards for (a festival's blessing sign-in, a
   flip-card login): never an event's own activity, and their rewards are the announcement's. */
const SIDE_TYPES = new Set([...LOGIN_TYPES, 'LOGIN_ONLY', 'PRAY_ONLY', 'BLESS_ONLY', 'FLIP_ONLY']);
/*
 * The event kinds whose stages are a story campaign, and so give their first-clear rewards. A
 * mode's "stages" are not (Duel Channel's two entries list an Originite Prime the mode never
 * gives: its rewards are its milestones), nor are a Contingency Contract's (TYPE_ACT5D1) or
 * anything filed as DEFAULT (Reclamation Algorithm, Pinch-Out).
 */
export const isStoryActivity = type => /^TYPE_ACT\d+SIDE$/.test(type) || ['TYPE_ACT9D0', 'TYPE_ACT3D0', 'TYPE_ACT4D0', 'TYPE_ACT5D0', 'MINISTORY', 'TYPE_MAINSS', 'YEAR_5_GENERAL'].includes(type);
/** Where a mode keeps its milestone track (points needed -> reward), under one of these names. */
const MILESTONE_LISTS = ['milestoneList', 'mileStoneList', 'mileStoneItemList', 'milestoneData'];
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
  // The cosmetics and mode pieces the item table does not hold, named as the official posts
  // word them ("Icon 'Destination'", "Home Screen UI [Poly Vision]", "Profile Theme 'Vista'").
  const meta = tables.displayMeta ?? {};
  const quoted = text => `'${String(text).replace(/^['“]|['”]$/g, '')}'`;
  const cosmetics = new Map([
    ...list(meta.playerAvatarData?.avatarList).filter(a => a.avatarItemName).map(a => [a.avatarId, `Icon ${quoted(a.avatarItemName)}`]),
    ...list(meta.homeBackgroundData?.homeBgDataList).filter(b => b.bgName).map(b => [b.bgId, `Main Menu Background ${quoted(b.bgName)}`]),
    ...list(meta.homeBackgroundData?.themeList).filter(t => t.tmName).map(t => [t.id, `Home Screen UI ${quoted(t.tmName)}`]),
    ...Object.values(meta.nameCardV2Data?.skinData ?? {}).filter(c => c.name).map(c => [c.id, `Profile Theme ${quoted(c.name)}`]),
    ...list(tables.charms).map(c => [c.id, c.name]),
  ]);
  // Ideal City's cart parts (ACT_CART_COMPONENT), in the activity table's carData.
  const pieces = new Map(Object.values(tables.activity?.carData?.carDict ?? {}).map(part => [part.compId, part.name]));
  return reward => {
    const { id, type } = reward;
    let name = items[id]?.name ?? cosmetics.get(id) ?? pieces.get(id);
    // A piece of furniture is sometimes typed NONE (Grani's mission reward): named by its id.
    if (type === 'FURN' || (!name && furniture[id])) name = furniture[id]?.name;
    if (type === 'CHAR') name = characters[id]?.name;
    if (type === 'CHAR_SKIN') {
      const skin = skins[id];
      name = skin ? `${characters[skin.charId]?.name ?? skin.charId} / ${skin.displaySkin?.skinName ?? id}` : null;
    }
    // A ten-roll permit the table names like a single one ("Sing while Drinking Headhunting
    // Permit", LIMITED_TKT_GACHA_10) says so: it is ten pulls, not one.
    if (name && /TKT_GACHA_10$/.test(type) && !/ten-roll/i.test(name)) name = `${name} (ten-roll)`;
    return { name: name ?? id, count: reward.count, kind: KIND[type] ?? (furniture[id] ? 'furniture' : 'other'), id };
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
const GENERIC = new Set(['login', 'event', 'events', 'sign', 'in', 'open', 'opens', 'limited', 'time', 'special', 'cumulative', 'new', 'update', 'the', 'a', 'of', 'and', 'campaign', 'now']);
/** A login's name without its generic words and years: what tells two logins apart. */
const distinctive = title => new Set(String(title ?? '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').split(/[^a-z]+/).filter(w => w.length > 2 && !GENERIC.has(w)));
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
function tableGroups(events, tables, { startOf, match, name, region, claims = [] }) {
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
    // Not one an announcement claims for another event.
    const logins = opened.filter(entry => LOGIN_TYPES.has(entry.type) && Math.abs(entry.startTime - start) <= 86400
      && !claims.some(c => c.event !== event.name && Math.abs(c.start - entry.startTime) <= 86400));
    if (logins.length === 1) { own.push({ event, activity: logins[0] }); ownSide.set(logins[0].id, event); }
  }
  own.sort((a, b) => a.activity.startTime - b.activity.startTime);
  const result = {};
  const groupsOf = entry => (result[entry.event.name] ??= { activity: entry.activity.id, ...tag, groups: [] }).groups;
  // The event a side activity belongs to: the latest one opened at or before it, still running.
  // The event an announcement names for a login opening then (claims: { event, start }), else the
  // latest one opened by the end of the login's first day (a login opening hours before its
  // event's stages is still that event's), and still running.
  const ownerOf = side => {
    // Two announcements of the same day can both mention one login (an anniversary sign-in in
    // the side story's post and in a mode's): the story event's claim stands.
    const claimed = claims.filter(c => Math.abs(c.start - side.startTime) <= 86400)
      .map(c => own.find(entry => entry.event.name === c.event)).filter(Boolean)
      .sort((a, b) => Number(isStoryActivity(b.activity.type)) - Number(isStoryActivity(a.activity.type)))[0];
    if (claimed) return claimed;
    return own.filter(entry => entry.activity.startTime <= side.startTime + 86400 && side.startTime < entry.activity.endTime).at(-1);
  };
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
    // A mode's milestone track: the points it takes, and what each milestone gives.
    const data = activity.activity?.[entry.activity.type]?.[id];
    const track = MILESTONE_LISTS.map(field => data?.[field]).find(value => Array.isArray(value) && value.length);
    if (track) {
      const rewards = track.map(step => step.reward ?? step.rewardItem ?? step.item).filter(reward => reward?.id);
      const points = Math.max(...track.map(step => step.tokenNum ?? step.needPointCnt ?? 0));
      // The points are an item (milestoneItemId, milestonePointId or milestoneId by mode), the
      // track has a name of its own ("Ivy Vine Program").
      const c = data?.constData ?? {};
      const pointName = tables.items?.items?.[c.milestoneItemId ?? c.milestonePointId ?? c.milestoneId]?.name ?? null;
      const trackName = c.milestonePlanName ?? c.milestoneNameEN ?? c.milestoneName ?? 'Milestones';
      if (rewards.length) groupsOf(entry).push({ kind: 'milestones', title: `${trackName}: ${track.length} steps${points ? `, up to ${points.toLocaleString('en-US')} ${pointName ?? 'points'}` : ''}`, source: src(`activity_table ${id}`), count: track.length, points, pointName, items: total(rewards.map(name)), ...tag });
    }
    const missions = list(activity.missionData).filter(mission => mission.missionGroup === id);
    const missionRewards = total(missions.flatMap(mission => list(mission.rewards)).map(name));
    if (missionRewards.length) groupsOf(entry).push({ kind: 'missions', title: 'Event missions', source: src(`activity_table missionData ${id}`), count: missions.length, items: missionRewards, ...tag });
    // The event's stages: by their zone's activity, or by their id for an original whose stages a
    // rerun's zones have since taken over (act15side's are in act15sre's zones).
    const zones = activity.zoneToActivity ?? {};
    const stages = Object.values(tables.stages?.stages ?? {}).filter(stage => zones[stage.zoneId] === id || String(stage.stageId).startsWith(`${id}_`));
    const firstClear = stages.flatMap(stage => list(stage.stageDropInfo?.displayDetailRewards)
      .filter(reward => reward.dropType === 'COMPLETE' && reward.type !== 'ACTIVITY_ITEM').map(reward => name({ ...reward, count: reward.count ?? 1 })));
    if (firstClear.length && isStoryActivity(entry.activity.type)) {
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
  // A post cached before its entities were decoded twice keeps "&apos;" in its lines: decoded here.
  posts = posts.map(post => ({ ...post, lines: (post.lines ?? []).map(decodeEntities) }));
  const name = rewardNamer(tables);
  // The official announcements, each matched to the event it announces: the one opening on the
  // post's first DURATION whose name the post's title carries. Each login section's DURATION
  // claims the login opening then for that event.
  const dated = events.map(event => ({ event, start: globalStart(event), title: fold(eventTitle(event.name)) })).filter(entry => entry.start != null);
  const announced = posts.map(post => {
    const window = postWindow(post.lines ?? []);
    if (!window) return null;
    const start = Date.parse(window.start) / 1000;
    const named = fold(postEventName(post.title));
    const entry = dated.find(candidate => Math.abs(candidate.start - start) <= 1.5 * 86400 && named && (candidate.title.includes(named) || named.includes(candidate.title)));
    return entry ? { post, event: entry.event, sections: newsSections(post.lines ?? []) } : null;
  }).filter(Boolean);
  const sectionStart = section => {
    const line = section.lines.map(l => l.match(/^DURATION:\s*(.*)$/)).find(Boolean);
    const window = line && parseDuration(line[1]);
    return window ? { start: Date.parse(window.start) / 1000, end: window.end ? Date.parse(window.end) / 1000 : null } : null;
  };
  const isLogin = title => /LOGIN|SIGN-IN|SIGN IN/.test(title);
  const claims = announced.flatMap(({ event, sections }) => sections.filter(s => isLogin(s.title)).map(s => ({ event: event.name, start: sectionStart(s)?.start })).filter(c => c.start != null));
  // Global: its own activity has the event's name and opens on its Global start; a rerun's
  // "Retrospection" and a numbered run's "#3" are the same name.
  const result = tableGroups(events, tables, {
    startOf: globalStart, name, region: 'Global', claims,
    match: (event, opened) => {
      const title = key(eventTitle(event.name));
      // Or the end of it ("Back to Castle" for "Integrated Lookback: Back to Castle").
      return opened.find(entry => !SIDE_TYPES.has(entry.type) && key(entry.name) === title)
        ?? opened.find(entry => !SIDE_TYPES.has(entry.type) && title.length >= 6 && key(entry.name).startsWith(title))
        ?? opened.find(entry => !SIDE_TYPES.has(entry.type) && key(entry.name).length >= 8 && title.endsWith(key(entry.name)));
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
  // Each announcement's sections, as its event's.
  const kindOf = kindByName(tables);
  const themesNamed = new Map();
  for (const { post, event, sections } of announced) {
    const entry = { event };
    const groups = (result[entry.event.name] ??= { activity: null, groups: [] }).groups;
    for (const section of sections) {
      const when = sectionStart(section);
      const lines = section.lines.filter(line => /^(DURATION|DETAILS|REWARDS?|NOTE|HOW TO OBTAIN):/.test(line)).slice(0, 8);
      if (isLogin(section.title) && !/PACK/.test(section.title)) {
        // A login the tables give no rewards for (a festival blessing, a flip-card login): as the
        // post words it, so it is not lost. One the tables detail is already its own group.
        // Matched by the distinctive words of its name ("COMING OF BLESSINGS LOGIN EVENT" is the
        // "Coming of Blessings Sign-In Event"); a section with none ("SPECIAL LOGIN EVENT OPEN")
        // is the banner gift opening that day. A date alone would hide a festival sign-in behind
        // the banner gift that opens with it. A post may also name a login differently from the
        // tables ("LUMINOUS DAYLIGHT" is the "May the Sunshine Still Sign-In Event"): a sign-in
        // over the same window to the hour, the same number of days where the post states one,
        // is the same; a banner gift is the same where the post names its permit. A window alone
        // never matches a banner gift: the festival blessings sign-in shares its window.
        const words = distinctive(section.title);
        const logins = groups.filter(g => g.kind === 'login' || g.kind === 'banner-gift');
        const text = section.lines.join(' ').toLowerCase();
        const stated = Number(text.match(/(?:log|sign) in (?:cumulatively )?for (\d+) days/)?.[1]) || null;
        const sameWindow = g => g.kind === 'login' && when?.end && g.start && g.end
          && Math.abs(Date.parse(g.start) / 1000 - when.start) <= 7200 && Math.abs(Date.parse(g.end) / 1000 - when.end) <= 7200
          && (stated === null || g.days === stated);
        const namesGift = g => g.kind === 'banner-gift' && g.items.some(item => text.includes(item.name.replace(/\s*\(ten-roll\)$/, '').toLowerCase()));
        const detailed = logins.some(g => sameWindow(g) || namesGift(g)) || (words.size
          ? logins.some(g => [...distinctive(g.title)].some(w => words.has(w)))
          : when && logins.some(g => g.kind === 'banner-gift' && Math.abs(Date.parse(g.start) / 1000 - when.start) <= 86400));
        if (!detailed && lines.length) groups.push({ kind: 'notice', title: section.title, source: post.url, items: [], lines });
        continue;
      }
      if (/FREE (?:ROLL|HEADHUNTING|PULL)|DAILY FREE/.test(section.title) && when?.end) {
        // The limited banner's daily free roll: one a day for the window's days.
        const days = Math.round((when.end - when.start) / 86400);
        if (days > 0) groups.push({ kind: 'free-rolls', title: section.title, source: post.url, days, items: [{ name: 'Daily free headhunting roll', count: days, kind: 'free-roll', id: 'free-roll' }] });
        continue;
      }
      if (/PACK/.test(section.title)) {
        const packs = parsePacks(section).map(pack => ({ ...pack, contents: pack.contents.map(item => ({ ...item, kind: kindOf(item.name) })) }));
        // A post may open two sections under one heading ("LIMITED-TIME PACKS AVAILABLE" twice): one list.
        const same = groups.find(g => g.kind === 'packs' && g.title === section.title);
        if (same) same.packs.push(...packs.filter(pack => !same.packs.some(p => p.name === pack.name)));
        else if (packs.length) groups.push({ kind: 'packs', title: section.title, source: post.url, items: [], packs });
      } else if (NOTICE.test(section.title) && !NOT_NOTICE.test(section.title)) {
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
  // A reward of none is a label the mission list carries beside the real one ("'Symphony of
  // Drums'" x0 next to the drum it names): not a reward.
  for (const { groups } of Object.values(result)) for (const group of groups) if (group.items) group.items = group.items.filter(item => item.count > 0);
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

/**
 * What a reader would see as broken, failed here rather than shipped: an HTML entity left in a
 * name ("Profile Theme &apos;Vista&apos;"), a reward shown by its id ("avatar_activity_ED3"), or
 * one event showing two sections under one heading.
 */
export function assertEventRewards(rewards, text = JSON.stringify(rewards)) {
  const entity = text.match(/.{0,40}&(?:#x[0-9a-f]+|#\d+|[a-z]+);.{0,20}/i);
  if (entity) throw new Error(`event-rewards: an HTML entity is left in the output: ${entity[0]}`);
  for (const [name, { groups }] of Object.entries(rewards)) {
    const seen = new Set();
    for (const group of groups) {
      const raw = group.items?.find(item => item.name === item.id && /_/.test(item.id));
      if (raw) throw new Error(`event-rewards: ${name} shows "${raw.id}", a reward no table names (${group.kind})`);
      const key = `${group.kind}: ${group.title}`;
      if (seen.has(key)) throw new Error(`event-rewards: ${name} has two "${key}" sections`);
      seen.add(key);
    }
  }
}

async function main() {
  const root = process.cwd();
  const excel = path.join(process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata', 'en', 'gamedata', 'excel');
  const read = file => JSON.parse(fs.readFileSync(path.join(excel, file), 'utf8'));
  const events = fs.readdirSync(path.join(root, 'data/events')).filter(file => /^events_\d+\.json$/.test(file))
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(root, 'data/events', file), 'utf8')));
  const posts = readOfficialNews(root);
  const cnExcel = path.join(process.env.ARKPEDIA_CN || '.cache/upstream/cn-resource', 'gamedata', 'excel');
  const readCn = file => JSON.parse(fs.readFileSync(path.join(cnExcel, file), 'utf8'));
  const rewards = buildEventRewards(events, {
    activity: read('activity_table.json'), stages: read('stage_table.json'), items: read('item_table.json'),
    building: read('building_data.json'), characters: read('character_table.json'), skins: read('skin_table.json'),
    displayMeta: read('display_meta_table.json'), charms: read('charm_table.json'),
  }, posts, {
    activity: readCn('activity_table.json'), stages: readCn('stage_table.json'), items: readCn('item_table.json'),
    building: readCn('building_data.json'), characters: readCn('character_table.json'), skins: readCn('skin_table.json'),
    displayMeta: readCn('display_meta_table.json'), charms: readCn('charm_table.json'),
  });
  const storeNames = storeNameTranslations(events, { building: readCn('building_data.json'), items: readCn('item_table.json') }, { building: read('building_data.json'), items: read('item_table.json') });
  const storeFurniture = storeFurnitureNames(events, { building: readCn('building_data.json') }, { building: read('building_data.json') });
  const out = { storeFurniture, about: 'Rewards the game tables and official announcements list for each event beyond its store: the Global tables, the CN ones for an event Global has not had yet, and a rerun its original run\'s until its own appear (scripts/build/build-event-rewards.mjs). Generated every refresh: do not edit.', storeNames, events: rewards };
  const file = path.join(root, 'data/event-rewards.json');
  const text = `${JSON.stringify(out, null, 1)}\n`;
  assertEventRewards(rewards, text);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
  console.log(`Event rewards: ${Object.keys(rewards).length} events, ${Object.values(rewards).reduce((n, e) => n + e.groups.length, 0)} groups.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
