/** Server-only artwork projection; full asset/account indexes never enter the client. */
import accountMap from '@/data/game-account-map.json';
import covers from '@/data/story-library-art.json';
import { getOperatorIconPath, operatorPortraitFile } from '@/lib/operators/operatorIcon';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { getContentPoster } from '@/lib/stages/stageContents';
import type { StoryLibraryEntry } from './storyLibrary';
import type { StoryMap } from './storyMap';

const operators = new Map(Object.entries(accountMap.chars).map(([id, op]) => [id.split('_').slice(2).join('_'), op]));
const art = covers.images as Record<string, string>;

export function storyLibraryArt(entries: StoryLibraryEntry[], map: StoryMap): StoryLibraryEntry[] {
  const pictures = new Map(map.elements.flatMap(element => element.type === 'picture' && element.link?.story && element.image ? [[element.link.story, `/${element.image}`] as const] : []));
  return entries.map(entry => {
    // Older library releases hotlinked reader art. Reproject it through our asset index.
    if (entry.image && !entry.image.startsWith('https://arknights.timo.beer/')) return entry;
    const code = entry.category === 'record' ? /^story_(.+)_set_\d+$/.exec(entry.id)?.[1]
      : entry.category === 'module' ? /^uniequip_\d+_(.+)$/.exec(entry.id)?.[1] : undefined;
    const op = code ? operators.get(code) : undefined;
    if (op && publicFileExists(operatorPortraitFile(op))) return { ...entry, image: getOperatorIconPath(op), imageKind: 'portrait' };
    const id = ({ main_15: 'act2mainss_zone1', main_16: 'act3mainss_zone1', main_17: 'act4mainss_zone1' } as Record<string, string>)[entry.id]
      ?? (/^(rogue_\d+)_/.exec(entry.id)?.[1] ?? entry.id);
    // New main-story chapters may not be on the community canvas yet. Their
    // reader cover is chapter art; a stage-content poster may be an event banner.
    const cover = entry.category === 'main' && !pictures.has(entry.id) ? art[entry.id] : undefined;
    const image = cover ?? getContentPoster(id, ['main', 'side', 'mini'].includes(entry.category) ? 'story' : entry.category, entry.title)
      ?? pictures.get(entry.id) ?? art[entry.id] ?? art[id];
    return image ? { ...entry, image, imageKind: 'art' } : entry;
  });
}
