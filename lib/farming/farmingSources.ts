import stageIndex from '@/public/stages-index.json';
import contents from '@/data/stages-content.json';
import { getAllEvents } from '@/lib/schedule/schedule';
import { getContentPoster } from '@/lib/stages/stageContents';
import { publishedArt } from '@/lib/art/publishedArt';
import type { StageModeCard } from '@/lib/stages/stageTypes';
import { loadRelease, readPageProps } from '@/lib/content/release';
import { withCurrentEventStores } from '@/lib/schedule/materialCountdown';
import type { FarmingTier } from './farmingTypes';
import type { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import type { FarmingWindows } from '@/lib/schedule/countdownWindows';

export interface FarmingSource { name: string; art: string | null }
export type FarmingSources = Record<string, FarmingSource>;

/** Resolve only the guide's sources on the server, including when it reads an older release. */
export function getFarmingSources(props: { windows?: FarmingWindows; __contentTables?: Record<string, unknown> }, cards: Pick<StageModeCard, 'id' | 'name' | 'kind' | 'label' | 'art'>[] = [], releasedEvents: Pick<ScheduleEvent, 'name' | 'poster'>[] = []): FarmingSources {
  const result: FarmingSources = {};
  const tiers = (props.__contentTables?.['farming-tiers'] ?? []) as FarmingTier[];
  const stages = new Map(stageIndex.filter(stage => !stage.variant).map(stage => [stage.code, stage]));
  for (const tier of tiers) for (const material of tier.materials) for (const stage of material.stages) {
    const row = stages.get(stage.label);
    const content = row?.contentId ? contents[row.contentId as keyof typeof contents] : null;
    const chapter = stage.label.match(/^(?:S|H|R|JT|M)?(\d+)-/i)?.[1];
    const card = cards.find(card => card.id === row?.contentId)
      ?? (chapter ? cards.find(card => card.kind === 'story' && Number(card.label?.replace(/^EP\s*/, '')) === Number(chapter)) : undefined);
    if (card) result[stage.label] = { name: card.name, art: card.art };
    else if (content) result[stage.label] = { name: content.name, art: getContentPoster(content.id, content.kind, content.name) };
  }
  const names = new Set([
    ...(props.windows?.eventStore ?? []),
    ...Object.values(props.windows?.materials ?? {}).flat(),
  ].flatMap(row => row.event ? [row.event] : []));
  for (const event of getAllEvents()) {
    if (names.has(event.name)) result[event.name] = { name: event.name, art: publishedArt(event.poster) };
  }
  for (const event of releasedEvents) {
    // The published schedule has already checked its art against this release's
    // asset index. A bundled index must not reject an event added after deployment.
    if (names.has(event.name)) result[event.name] = { name: event.name, art: event.poster };
  }
  return result;
}

/** Use the same immutable release's chapter and event catalogues, including chapters newer than this app bundle. */
export async function finalizeFarmingSources<P extends { windows?: FarmingWindows; __contentRelease?: { release: string }; __contentTables?: Record<string, unknown> }>(props: P): Promise<P & { sources: FarmingSources }> {
  const current = props.windows ? { ...props, windows: withCurrentEventStores(props.windows) } : props;
  const loaded = props.__contentRelease ? await loadRelease() : undefined;
  const [stages, schedule] = loaded && loaded.context.release === props.__contentRelease?.release
    ? await Promise.all([readPageProps(loaded, '/stages'), readPageProps(loaded, '/schedule')])
    : [null, null];
  return { ...current, sources: getFarmingSources(current, (stages?.candidates ?? []) as StageModeCard[], (schedule?.eventRows ?? []) as Pick<ScheduleEvent, 'name' | 'poster'>[]) };
}
