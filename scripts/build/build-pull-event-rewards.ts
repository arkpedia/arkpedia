import { serverDay } from '../../lib/time/servers.mjs';
/** Generate event rewards independently of headhunting banners.
 * Run with PULL_CN_DATA_DIR pointing to the cached CN excel tables.
 * Dates are deliberately NOT stored: the planner resolves the live event calendar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllEvents } from '../../lib/schedule/schedule';

// The stage refresh owns the shared CN checkout. Reuse it so a clean CI runner
// does not depend on a second, manually populated `.cache/upstream/cn` folder.
const dir = process.env.PULL_CN_DATA_DIR ?? '.cache/upstream/cn-resource/gamedata/excel';
const activity = JSON.parse(fs.readFileSync(path.join(dir, 'activity_table.json'), 'utf8'));
const stages = JSON.parse(fs.readFileSync(path.join(dir, 'stage_table.json'), 'utf8')).stages;
const noOP = new Set(['MULTIPLAY', 'MULTIPLAY_V3', 'MULTIPLAY_VERIFY2', 'ENEMY_DUEL', 'APRIL_FOOL', 'ACT_FOOTBALL', 'ARK_HUB']);
const op: Record<string, number> = {};
for (const st of Object.values(stages) as any[]) {
  if (!st.stageDropInfo?.displayDetailRewards?.some((r: any) => r.id === '4002')) continue;
  const id = activity.zoneToActivity[st.zoneId] ?? st.zoneId?.match(/^(act[0-9a-z]+?)_(zone|sub|perm)/)?.[1] ?? st.stageId?.match(/^(act[0-9a-z]+?)_/)?.[1];
  if (id) op[id] = (op[id] ?? 0) + 1;
}
const cnDate = (timestamp: number) => serverDay(timestamp);
// The calendar's translated crossover date differs by one day from CN gamedata.
const bindings: Record<string, string> = {'[Side Story ‐ Crossover] Sur le lac lune vivante': 'act54side'};
const output = [];
for (const event of getAllEvents()) {
  if (!event.global.dateRange || event.global.dateRange.split('–')[1] < '2026/08/01') continue;
  const start = event.cn.dateRange?.split('–')[0];
  const matches = Object.values(activity.basicInfo).filter((a: any) => a.hasStage && cnDate(a.startTime) === start) as any[];
  const id = bindings[event.name] ?? (matches.length === 1 ? matches[0].id : null);
  if (!id) {
    if (/^\[(Side Story|Story Collection|Rerun|Celebration)/.test(event.name)) throw new Error(`Bind missing event activity: ${event.name}`);
    continue;
  }
  const basic = activity.basicInfo[id];
  if (noOP.has(basic.type)) continue;
  const wall = (Object.values(activity.basicInfo) as any[]).find(a => activity.dynActs[a.id]?.slotCount && cnDate(a.startTime) === cnDate(basic.startTime));
  const wishDays = wall ? Math.round((wall.endTime - wall.startTime) / 86400) : 0;
  const raw = event as any;
  const blocks = raw.rewards ? (Array.isArray(raw.rewards) ? raw.rewards : [raw.rewards]) : [];
  const shop = blocks.find((b: any) => /store/i.test(b.type));
  // Prefer the site's itemized store; custom exchanges carry their own stock.
  const exchange = activity.activity[basic.type]?.[id]?.meldingGachaBoxGoodDataMap;
  const exchangePermits = exchange ? (Object.values(exchange).flat() as any[]).filter(g => g.itemId === '7003').reduce((n, g) => n + g.perCount * g.totalCount, 0) : null;
  const permits = shop ? shop.items.filter((i: any) => i.name === 'Headhunting Permit').reduce((n: number, i: any) => n + Number(i.reward_quantity) * Number(i.stock), 0)
    : exchangePermits ?? (basic.templateShopId ? 3 : 0);
  output.push({event: event.name, cnAct: id, op: op[id] ?? 0, shopPermits: permits,
    permitSource: shop ? 'event-store-items' : exchange ? 'cn-exchange-stock' : basic.templateShopId ? 'standard-event-shop-allowance' : 'none',
    wishActId: wall?.id ?? null, wishDays, wishOrundum: wishDays * 200});
}
fs.writeFileSync('data/pull-event-rewards.json', JSON.stringify(output, null, 2) + '\n');
console.log(output.map(e => `${e.event}: ${e.op} OP, ${e.shopPermits} permits`).join('\n'));
