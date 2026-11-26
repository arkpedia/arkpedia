import discovered from '@/config/discovered-home-cosmetics.json';
import catalogue from '@/config/event-cosmetic-previews.json';
import type { EventExtras, EventRewardsFile } from './tableRewards';

export type ThemeArt = { image: string; width: number; height: number };

export type HomeMenuItem = { label: string; art?: ThemeArt; caption?: ThemeArt };

export type HomeTheme = {
  name: string;
  layout?: { manifest: string; artRoot: string };
  localized?: boolean;
  nativeArt?: Record<string, ThemeArt>;
  terminal: HomeMenuItem;
  navigation: HomeMenuItem[];
  recruitment?: { heading: HomeMenuItem; choices: HomeMenuItem[] };
  shortcuts?: HomeMenuItem[];
  profile?: {
    name: string;
    level: number;
    sanity: { current: number; capacity: number; title: ThemeArt; plus: ThemeArt };
  };
  assistant?: { name: string; art: ThemeArt; voice: ThemeArt };
  decoration?: ThemeArt;
};

export type GlobalHomeCosmetics = Record<string, {
  name: string;
  purchasePacks: string[];
  art?: Record<string, ThemeArt>;
}>;

type GameAsset = { gameData?: { id: string } };

export type CosmeticPreview = {
  pack?: string;
  activity?: string;
  eventName?: string;
  source: string;
  scene: { title: string; name: string; image: string; native?: string } & GameAsset;
  theme?: HomeTheme & GameAsset;
  music?: { title: string; preview: string; source: string; provider?: string };
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
type ImportedCosmetic = { names: string[]; packs: string[]; animated?: boolean };

function importedPackPreview(pack: string, source: string, contents: readonly { name: string }[]): CosmeticPreview | undefined {
  function match(group: Record<string, ImportedCosmetic>, labels: string[]) {
    const named = Object.entries(group).filter(([, item]) => item.names.some(name =>
      contents.some(content => labels.some(label => mentionsCosmetic(content.name, label, name)))));
    return named.length ? named : Object.entries(group).filter(([, item]) =>
      item.packs.some(name => packKey(name) === packKey(pack)));
  }

  const backgrounds = match(discovered.backgrounds, BACKGROUND_LABELS);
  const themes = match(discovered.themes, THEME_LABELS);
  const unknownTheme = themes.length === 0 && contents.some(item =>
    THEME_LABELS.some(label => words(item.name).startsWith(label)));
  if (backgrounds.length !== 1 || themes.length > 1 || unknownTheme) return;

  const regionalName = ({ names }: ImportedCosmetic): string => names.find(name => contents.some(item =>
    ` ${words(item.name)} `.includes(` ${words(name)} `))) ?? names[0];
  const [backgroundId, background] = backgrounds[0];
  const backgroundPath = `/event-preview/${backgroundId}`;
  const name = regionalName(background);
  const preview: CosmeticPreview = {
    pack, source, scene: { title: name, name, image: `${backgroundPath}/background.webp`,
      ...(background.animated && { native: `${backgroundPath}/scene.json` }),
      gameData: { id: backgroundId } },
  };
  const theme = themes[0];
  if (theme) {
    const [id, data] = theme;
    const artRoot = `/event-preview/${id}`;
    preview.theme = {
      name: regionalName(data), gameData: { id }, terminal: { label: 'Terminal' }, navigation: [],
      layout: { manifest: `${artRoot}/layout.json`, artRoot },
    };
  }
  return preview;
}

function localizedTheme(theme: HomeTheme, global: GlobalHomeCosmetics[string]): HomeTheme {
  const art = (original?: ThemeArt) => {
    const key = original?.image.split('/').at(-1)?.replace(/\.webp$/, '');
    return key ? global.art?.[key] : undefined;
  };
  const menu = (item: HomeMenuItem): HomeMenuItem => {
    const caption = art(item.caption);
    const image = art(item.art) ?? item.art;
    return { label: item.label, ...(image ? { art: image } : {}), ...(caption ? { caption } : {}) };
  };
  return {
    ...theme,
    name: global.name,
    localized: true,
    ...(global.art && { nativeArt: global.art }),
    terminal: menu(theme.terminal),
    navigation: theme.navigation.map(menu),
    ...(theme.shortcuts && { shortcuts: theme.shortcuts.map(menu) }),
    ...(theme.recruitment && { recruitment: {
      heading: menu(theme.recruitment.heading),
      choices: theme.recruitment.choices.map(item => {
        const image = art(item.art);
        return { label: item.label, ...(image ? { art: image } : {}) };
      }),
    } }),
    ...(theme.profile && { profile: { ...theme.profile, sanity: {
      ...theme.profile.sanity,
      title: art(theme.profile.sanity.title) ?? theme.profile.sanity.title,
      plus: art(theme.profile.sanity.plus) ?? theme.profile.sanity.plus,
    } } }),
    ...(theme.assistant && { assistant: { ...theme.assistant, voice: art(theme.assistant.voice) ?? theme.assistant.voice } }),
    ...(theme.decoration && { decoration: art(theme.decoration) ?? theme.decoration }),
  };
}

function regionalParts(preview: CosmeticPreview, cosmetics: GlobalHomeCosmetics | undefined) {
  return {
    background: cosmetics?.[preview.scene.gameData?.id ?? ''],
    theme: cosmetics?.[preview.theme?.gameData?.id ?? ''],
  };
}

function withRegionalParts(preview: CosmeticPreview, { background, theme }: ReturnType<typeof regionalParts>): CosmeticPreview {
  return {
    ...preview,
    scene: background ? {
      ...preview.scene,
      name: background.name,
      image: background.art?.background?.image ?? preview.scene.image,
    } : preview.scene,
    ...(theme && preview.theme && { theme: localizedTheme(preview.theme, theme) }),
  };
}

export function regionalEventCosmeticPreview(activity: string | undefined, cosmetics: GlobalHomeCosmetics | undefined) {
  const preview = activity && previews.find(item => item.activity === activity);
  return preview ? withRegionalParts(preview, regionalParts(preview, cosmetics)) : undefined;
}

type Pack = { name: string; region?: string; contents: { name: string }[]; notes?: string[] };

export function regionalPackCosmeticPreview(
  activity: string | undefined, pack: Pack, source: string, cosmetics: GlobalHomeCosmetics | undefined,
): CosmeticPreview | undefined {
  const original = packCosmeticPreview(pack.name, source, [...pack.contents, ...(pack.notes ?? []).map(name => ({ name }))]);
  const preview = original ?? (activity && previews.find(item => item.activity === activity));
  if (!preview || !cosmetics || !preview.theme) return original;
  const parts = regionalParts(preview, cosmetics);
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

  return withRegionalParts({ ...preview, pack: pack.name, source }, parts);
}
