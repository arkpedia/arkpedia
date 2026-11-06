import { readPublishedContentPageProps } from '@/lib/content/release';
import { isOperatorReleased } from '@/lib/operators/operatorAvailability';
import type { RosterOperator, Operator } from '@/lib/operators/operatorTypes';
import { getWelfareInfo } from '@/lib/operators/operatorTypes';
import type { SkinWindow } from '@/lib/skins/skinAvailability';
import { parseGameWindow } from '@/lib/schedule/gameWindow';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { parseBannerWindow } from '@/lib/gacha/realGachaBanners';
import type { Skin } from '@/lib/skins/skinTypes';
import { communityStages } from '@/lib/community/catalogues';
import { regionalSkinWindows, type RegionalSchedules } from '@/lib/time/regional';
import { regionalTable } from '@/lib/time/regionalServer';
import { normalizeVideoText, type VideoDiscoveryContext } from './youtubeRelevance';

export type VideoContextEvent = { name: string; activityId?: string; note?: string | null; global?: { dateRange?: string | null; startAt?: string; endAt?: string; note?: string | null } | null };
type EventRecord = VideoContextEvent;
const eventName = (name: string) => name.replace(/\[[^\]]*\]/g, '').replace(/\brerun\b/gi, '').trim();
const eventKey = (name: string) => normalizeVideoText(eventName(name));

/** Current relevance follows verified Global windows, never the carousel's slide.
 * Read the release's existing page records so new operators/events need no deploy. */
export async function loadVideoDiscoveryContext(now: number, local = false): Promise<VideoDiscoveryContext> {
  const [home, roster, skinPage, stages, schedule] = await Promise.all([
    local ? null : readPublishedContentPageProps<{ __calendar?: { banners: HeadhuntingBanner[] }; } & { [key: string]: unknown }>('/'),
    local ? null : readPublishedContentPageProps<{ operators: RosterOperator[] }>('/operators'),
    local ? null : readPublishedContentPageProps<{ skins: Skin[]; availabilityWindows?: SkinWindow[]; __contentTables?: { 'regional-schedules'?: RegionalSchedules } }>('/skins'),
    local ? [] : communityStages(),
    local ? null : readPublishedContentPageProps<{ events: EventRecord[] }>('/schedule'),
  ]);
  const homeCalendar = home?.__calendar as { events?: (EventRecord & { start?: string; end?: string; dateRange?: string })[]; banners: HeadhuntingBanner[]; skins?: Skin[]; skinWindows?: SkinWindow[] } | undefined;
  // Like the shipped community catalogues, this build constant removes all local
  // source loaders from Worker code. API routes must read published records.
  const fallback = process.env.ARKPEDIA_WORKER === '1' ? null
    : local || !roster || !skinPage || !schedule || !homeCalendar
      ? (await import('./youtubeContextLocal')).localVideoContextRecords() : null;
  const rawEvents = schedule?.events ?? fallback?.events ?? [];
  const events: EventRecord[] = homeCalendar?.events?.map(event => ({ ...event, global: { dateRange: event.dateRange ?? event.global?.dateRange,
    startAt: event.start ?? event.global?.startAt, endAt: event.end ?? event.global?.endAt, note: event.note ?? event.global?.note } })) ?? rawEvents;
  const operators: (RosterOperator | Operator)[] = roster?.operators ?? fallback?.operators ?? [];
  const skins = skinPage?.skins ?? homeCalendar?.skins ?? fallback?.skins ?? [];
  const catalogueWindows = skinPage?.availabilityWindows ?? homeCalendar?.skinWindows ?? fallback?.windows ?? [];
  const regional = skinPage?.__contentTables?.['regional-schedules'] ?? fallback?.regional ?? await regionalTable('/skins');
  const windows = regionalSkinWindows(catalogueWindows, regional.servers.en, 'en');
  const activeEvents = events.flatMap(event => {
    const window = parseGameWindow(event.global?.dateRange, event.global ?? {});
    if (!window || /estimated|predicted/i.test(event.global?.note ?? '') || now < +window.start || now >= +window.end) return [];
    const source = rawEvents.find(raw => eventKey(raw.name) === eventKey(event.name) && raw.activityId);
    const activity = event.activityId ?? source?.activityId;
    const ids = activity ? [activity, activity.replace(/sre$/, 'side')] : [];
    const codes = local ? (fallback?.stages ?? []).filter(stage => ids.includes(stage.contentId ?? '')).map(stage => stage.code)
      : stages.filter(stage => ids.some(id => stage.id.startsWith(`${id}_`))).map(stage => stage.code);
    const prefixes = [...new Set(codes.map(code => code.match(/^([A-Z]+)-/)?.[1]).filter((prefix): prefix is string => !!prefix))];
    return [{ name: eventName(event.name), aliases: [eventName(event.name)], until: +window.end, stagePrefixes: prefixes }];
  });
  const firstNames = new Map<string, number>();
  for (const operator of operators) {
    const first = operator.name.split(' ')[0]; firstNames.set(first, (firstNames.get(first) ?? 0) + 1);
  }
  const aliases = (operator: RosterOperator | Operator) => [...new Set([operator.name, ...('aliases' in operator ? operator.aliases ?? [] : []),
    ...(firstNames.get(operator.name.split(' ')[0]) === 1 ? [operator.name.split(' ')[0]] : [])])];
  const currentOperators = new Map<string, number>();
  for (const banner of homeCalendar?.banners ?? fallback?.banners ?? []) {
    if (!banner.global_date || banner.globalLineupPending) continue;
    const window = parseBannerWindow(banner);
    if (window && +window.start <= now && now < +window.end) for (const name of [...banner.six_stars, ...(banner.rate_up_six_stars ?? []), ...banner.five_stars, ...(banner.four_stars ?? [])]) currentOperators.set(name, +window.end);
  }
  for (const operator of operators) {
    const welfare = ('obtain' in operator ? operator.obtain?.welfare?.note : undefined) ?? getWelfareInfo(operator.howToObtain)?.['Unlock Location'];
    const event = welfare && activeEvents.find(event => eventKey(event.name) === eventKey(welfare));
    if (event) currentOperators.set(operator.name, event.until);
  }
  return {
    events: activeEvents,
    operators: operators.filter(operator => currentOperators.has(operator.name) && isOperatorReleased(operator, now))
      .map(operator => ({ name: operator.name, aliases: aliases(operator), until: currentOperators.get(operator.name)! })),
    skins: windows.filter(window => !window.estimated && window.kind !== 'draw' && Date.parse(window.startAt) <= now && now < Date.parse(window.endAt))
      .flatMap(window => window.skinIds.flatMap(id => {
        const skin = skins.find(skin => `${skin.model} / ${skin.name}` === id);
        const operator = operators.find(operator => operator.name === skin?.model);
        return skin ? [{ name: `${skin.model} · ${skin.name}`, aliases: [skin.name], until: Date.parse(window.endAt),
          ...(operator && skins.filter(other => other.model === skin.model).length === 1 ? { soleSkinModelAliases: aliases(operator) } : {}) }] : [];
      })),
  };
}
