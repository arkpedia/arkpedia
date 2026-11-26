import discovered from '@/config/discovered-home-cosmetics.json';
import catalogue from '@/config/event-cosmetic-previews.json';
import {
  getHomePreview, regionalHomeParts, withRegionalHomeParts,
  type GlobalHomeCosmetics, type HomePreview, type ImportedCosmetic,
} from '@/lib/home/previews';
import type { EventExtras, EventRewardsFile } from './tableRewards';

export type CosmeticPreview = HomePreview & {
  pack?: string;
  activity?: string;
  eventName?: string;
  source: string;
};

type PackGroup = EventExtras['packs'][number];
export type CosmeticPack = PackGroup['packs'][number] & { cosmeticPreview?: CosmeticPreview };

export type CosmeticEventExtras = Omit<EventExtras, 'packs'> & {
  cosmeticPreview?: CosmeticPreview;
  packs: (Omit<PackGroup, 'packs'> & { packs: CosmeticPack[] })[];
};

export type CosmeticRewardData = Omit<EventRewardsFile, 'events'> & {
  globalHomeCosmetics?: GlobalHomeCosmetics;
  events: Record<string, EventRewardsFile['events'][string] & { activity?: string | null }>;
};

const previews: readonly CosmeticPreview[] = catalogue;

export function packCosmeticPreview(pack: string, source: string, contents: readonly { name: string }[] = []): CosmeticPreview | undefined {
  return previews.find(preview => preview.pack === pack && preview.source === source)
    ?? importedPackPreview(pack, source, contents);
}

// Published event page payloads can predate a code-owned background preview.
export function standaloneBackgroundPreview(eventName: string): CosmeticPreview | undefined {
  return previews.find(preview => !preview.pack && preview.eventName === eventName);
}

const words = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const packKey = (value: string) => words(value).replace(/^an? /, '');

function mentionsCosmetic(value: string, kind: string, name: string): boolean {
  return ` ${words(value)} `.includes(` ${kind} ${words(name)} `);
}

const BACKGROUND_LABELS = ['background', 'main menu background', 'home screen background', 'home background', '主题场景'];
const THEME_LABELS = ['home screen ui', 'home screen theme', 'main menu theme', 'main menu ui', '界面主题'];

function importedPackPreview(pack: string, source: string, contents: readonly { name: string }[]): CosmeticPreview | undefined {
  function match(group: Record<string, ImportedCosmetic>, labels: string[]) {
    const named = Object.entries(group).filter(([, item]) => item.names.some(name =>
      contents.some(content => labels.some(label => mentionsCosmetic(content.name, label, name)))));
    return named.length ? named : Object.entries(group).filter(([, item]) =>
      Object.keys(item.packs).some(name => packKey(name) === packKey(pack)));
  }

  const backgrounds = match(discovered.backgrounds, BACKGROUND_LABELS);
  const themes = match(discovered.themes, THEME_LABELS);
  const unknownTheme = themes.length === 0 && contents.some(item =>
    THEME_LABELS.some(label => words(item.name).startsWith(label)));
  if (backgrounds.length !== 1 || themes.length > 1 || unknownTheme) return;

  const regionalName = ({ names, packs }: ImportedCosmetic): string => names.find(name => contents.some(item =>
    ` ${words(item.name)} `.includes(` ${words(name)} `)))
    ?? Object.entries(packs).find(([name]) => packKey(name) === packKey(pack))?.[1]
    ?? names[0];
  const [backgroundId, background] = backgrounds[0];
  const themeEntry = themes[0];
  const preview = getHomePreview(backgroundId, themeEntry?.[0]);
  if (!preview) return;
  const name = regionalName(background);
  return {
    ...preview, pack, source,
    scene: { ...preview.scene, name, title: name },
    ...(preview.theme && themeEntry && { theme: { ...preview.theme, name: regionalName(themeEntry[1]) } }),
  };
}

export function regionalEventCosmeticPreview(activity: string | undefined, cosmetics: GlobalHomeCosmetics | undefined) {
  const preview = activity && previews.find(item => item.activity === activity);
  return preview ? withRegionalHomeParts(preview, regionalHomeParts(preview, cosmetics)) : undefined;
}

type Pack = { name: string; region?: string; contents: { name: string }[]; notes?: string[] };

export function regionalPackCosmeticPreview(
  activity: string | undefined, pack: Pack, source: string, cosmetics: GlobalHomeCosmetics | undefined,
): CosmeticPreview | undefined {
  const original = packCosmeticPreview(pack.name, source, [...pack.contents, ...(pack.notes ?? []).map(name => ({ name }))]);
  const preview = original ?? (activity && previews.find(item => item.activity === activity));
  if (!preview || !cosmetics || !preview.theme) return original;
  const parts = regionalHomeParts(preview, cosmetics);
  const { background, theme } = parts;

  if (!original) {
    if (pack.region === 'CN' || !background || !theme) return;
    const name = packKey(pack.name);
    const text = [...pack.contents.map(item => item.name), ...(pack.notes ?? [])];
    // The release's official offer must include both cosmetics. Match the game table's
    // purchase descriptions or the announcement's named contents, never offer order or price.
    const includes = (data: GlobalHomeCosmetics[string], kinds: string[]) =>
      data.purchasePacks.some(candidate => packKey(candidate) === name) ||
      text.some(line => kinds.some(kind => mentionsCosmetic(line, kind, data.name)));
    if (!includes(background, BACKGROUND_LABELS) ||
        !includes(theme, THEME_LABELS)) return;
  }

  return withRegionalHomeParts({ ...preview, pack: pack.name, source }, parts);
}
