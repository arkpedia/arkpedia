import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const clean = text => String(text ?? '').replace(/<[^>]*>/g, '').trim();
/** Global client rewards only. Paid login packages and banner-only permits are never savings. */
export function buildFreeRewards({ handbook, missions, openServer, checkin, activity, items, characters, shops, eventRewards = { events: {} }, announcements = { events: {} } }) {
  const names = items.items;
  const rewardItems = rewards => (Array.isArray(rewards) ? rewards : []).map(item => {
    const id = item.id ?? item.itemId, type = item.type ?? item.itemType;
    const count = Number(item.count);
    if (!id || !Number.isFinite(count) || count <= 0) throw new Error('Invalid free reward item');
    return { id, name: names[id]?.name ?? characters[id]?.name ?? item.name ?? ({ FURN: 'Furniture', CHAR_SKIN: 'Operator outfit', PLAYER_AVATAR: 'Player avatar', HOME_BACKGROUND: 'Home background', NAME_CARD_SKIN: 'Profile theme' }[type] ?? 'Reward item'), count,
      ...(id === '4002' ? { op: count } : id === '4003' ? { orundum: count } : id === '7003' ? { permits: count } : id === '7004' ? { permits: count * 10 } : {}),
      ...(type?.includes('TKT_GACHA') && !['7003', '7004'].includes(id) ? { restricted: true } : {}),
    };
  });
  const out = [];
  const add = (id, group, name, rewards, timing = {}, forecast = false) => {
    const list = rewardItems(rewards);
    if (list.length) out.push({ id: `free:${id}`, group, name: clean(name), rewards: list, ...timing, forecast });
  };
  for (const mission of Object.values(missions.missions)) {
    if (!['GUIDE', 'MAIN', 'SUB'].includes(mission.type)) continue;
    add(mission.id, mission.type === 'GUIDE' ? 'Pinboard missions' : 'Main and side missions', mission.description, mission.rewards, {}, true);
  }
  for (const group of Object.values(missions.missionGroups)) {
    if (group.type === 'GUIDE') add(group.id, 'Pinboard missions', group.title, group.rewards, {}, true);
  }
  // The current free beginner programme. Old replacement programmes and paid newbieCheckInPackageList are excluded.
  const current = [...openServer.schedule].sort((a, b) => b.startTs - a.startTs)[0];
  const starter = openServer.dataMap[current.id];
  for (const mission of starter.openServerMissionData) add(mission.id, 'Beginner rewards', mission.description, mission.rewards, {}, true);
  for (const key of ['checkInData', 'chainLoginData']) for (const day of starter[key]) {
    add(`${current.id}:${key}:${day.order}`, 'Beginner rewards', `${key === 'chainLoginData' ? 'Consecutive' : 'Cumulative'} sign-in · Day ${day.order}`, [day.item], {}, true);
  }
  add('welcome-mail', 'Beginner rewards', 'Welcome mail', [{ id: '4003', count: openServer.constant.firstDiamondShardMailCount }], {}, true);
  for (const milestone of openServer.longTermCheckInData?.groupList ?? []) add(milestone.groupId, 'Sign-in milestones', `${milestone.days} sign-in days · Doctor Lv.${milestone.level}`, milestone.rewardList);
  for (const month of Object.values(checkin.groups)) month.items.forEach((item, index) =>
    add(`${month.groupId}:${index + 1}`, 'Monthly sign-in', `${month.title} · Day ${index + 1}`, [item], { startAt: month.signStartTime * 1000, endAt: (month.signEndTime + 1) * 1000 }));
  for (const type of ['CHECKIN_ONLY', 'CHECKIN_ALL_PLAYER', 'CHECKIN_VS', 'LOGIN_ONLY']) for (const [id, event] of Object.entries(activity.activity[type] ?? {})) {
    const info = activity.basicInfo[id];
    if (!info) throw new Error(`Missing Global sign-in dates: ${id}`);
    const timing = { startAt: info.startTime * 1000, endAt: (info.rewardEndTime + 1) * 1000 };
    if (type === 'LOGIN_ONLY') add(id, 'Event sign-in and gifts', info.name, event.itemList, timing);
    for (const day of Object.values(event.checkInList ?? event.checkInDict ?? {})) {
      add(`${id}:${day.order}`, 'Event sign-in and gifts', `${info.name} · Day ${day.order}`, day.isDynItem ? [{ id: `${id}:choice`, name: 'Choice reward (choose one in game)', count: 1 }] : day.itemList ?? day.rewardList, timing);
    }
    for (const bonus of Object.values(event.pubBhvs ?? {})) add(`${id}:${bonus.allBehaviorId}`, 'Event sign-in and gifts', `${info.name} · ${bonus.allBehaviorDesc}`, bonus.rewards, timing);
  }
  // Official Global gifts may precede their client-table entries, including free selectors.
  const seen = new Set();
  for (const source of [eventRewards, announcements]) for (const [eventName, entry] of Object.entries(source.events)) for (const group of entry.groups ?? []) {
    if (!['login', 'banner-gift', 'free-rolls'].includes(group.kind) || (group.region ?? entry.region ?? 'Global') !== 'Global' || group.source?.startsWith('activity_table') || !group.start || !group.end) continue;
    const startAt = Date.parse(group.start), endAt = Date.parse(group.end);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) throw new Error(`Invalid free gift window: ${eventName}`);
    const totals = list => {
      const values = new Map();
      for (const item of list) values.set(item.id, (values.get(item.id) ?? 0) + item.count);
      return JSON.stringify([...values].sort(([a], [b]) => a.localeCompare(b)));
    };
    const title = clean(group.title).toLowerCase();
    const recorded = out.filter(reward => reward.group === 'Event sign-in and gifts' && reward.name.toLowerCase().includes(title)
      && reward.startAt === startAt && Math.abs(reward.endAt - endAt) <= 60_000);
    // When a later client patch carries the same announced gift, count its claims once.
    if (recorded.length && totals(recorded.flatMap(reward => reward.rewards)) === totals(rewardItems(group.items))) continue;
    const daily = group.kind === 'login' && group.days > 1 && group.items?.length && group.items.every(item => item.count % group.days === 0);
    const days = group.daily?.length ? group.daily : daily ? Array.from({ length: group.days }, () => group.items.map(item => ({ ...item, count: item.count / group.days }))) : [group.items];
    days.forEach((items, index) => {
      if (!items?.length) return;
      const identity = `${eventName}:${group.title}:${index}`;
      if (seen.has(identity)) return; seen.add(identity);
      const id = createHash('sha256').update(identity).digest('hex').slice(0, 24);
      add(`announcement:${id}`, 'Event sign-in and gifts', `${eventName} · ${group.title}${days.length > 1 ? ` · Day ${index + 1}` : ''}`,
        items.map(item => ({ ...item, id: item.id || `label:${item.name}`, type: item.kind })),
        { startAt, endAt, href: `/events/${encodeURIComponent(eventName)}` });
    });
  }
  // The client names these free packs but does not publish their contents here. Track the claim, without inventing currency.
  for (const [id, pack] of Object.entries(shops.shopGPDataDict)) if (id.startsWith('GP_freeL_')) {
    add(id, 'Free level-up packs', pack.displayName, [{ id, name: pack.displayName, count: 1 }]);
  }
  const paradox = Object.values(handbook.handbookStageData).map(stage => ({
    id: `paradox:${stage.stageId}`, name: clean(`${characters[stage.charId]?.name ?? stage.charId} · ${stage.name}`),
    amount: stage.rewardItem.filter(item => item.id === '4003').reduce((sum, item) => sum + item.count, 0),
  })).filter(stage => stage.amount > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(out.map(item => item.id)).size !== out.length) throw new Error('Duplicate free reward IDs');
  return { paradox, rewards: out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const excel = process.env.ARKPEDIA_EN_EXCEL ?? '.cache/upstream/en-gamedata/en/gamedata/excel';
  const read = name => JSON.parse(fs.readFileSync(path.join(excel, `${name}_table.json`), 'utf8'));
  const data = buildFreeRewards({ handbook: read('handbook_info'), missions: read('mission'), openServer: read('open_server'), checkin: read('checkin'), activity: read('activity'), items: read('item'), characters: read('character'), shops: read('shop_client'), eventRewards: JSON.parse(fs.readFileSync('data/event-rewards.json', 'utf8')), announcements: JSON.parse(fs.readFileSync('config/event-announcements.json', 'utf8')) });
  fs.writeFileSync('data/free-rewards.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`${data.paradox.length} Paradox Simulations; ${data.rewards.length} free reward claims`);
}
