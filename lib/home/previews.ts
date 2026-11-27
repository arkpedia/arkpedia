import discovered from '@/config/discovered-home-cosmetics.json';
import curated from '@/config/event-cosmetic-previews.json';

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

export type HomePreview = {
  scene: { title: string; name: string; image: string; native?: string } & GameAsset;
  theme?: HomeTheme & GameAsset;
  music?: { title: string; preview: string; source: string; provider?: string };
};

export type ImportedCosmetic = {
  names: string[];
  packs: Record<string, string>;
  animated?: boolean;
  globalName?: string;
  source?: { region: string };
  music?: { name: string };
};

type Room = Pick<HomePreview, 'scene' | 'music'>;
type Theme = NonNullable<HomePreview['theme']>;

const backgrounds = new Map<string, Room>();
const themes = new Map<string, Theme>();
const companionRooms = new Map<string, string>();
const curatedPreviews: readonly HomePreview[] = curated;

for (const [id, background] of Object.entries<ImportedCosmetic>(discovered.backgrounds)) {
  const path = `/event-preview/${id}`;
  const name = background.globalName ?? background.names.at(-1) ?? id;
  const audio = `${path}/music.m4a`;
  backgrounds.set(id, {
    scene: { name, title: name, image: `${path}/background.webp`,
      ...(background.animated && { native: `${path}/scene.json` }), gameData: { id } },
    ...(background.music && { music: { title: background.music.name, preview: audio, source: audio } }),
  });
}

for (const [id, data] of Object.entries<ImportedCosmetic>(discovered.themes)) {
  const artRoot = `/event-preview/${id}`;
  themes.set(id, { name: data.globalName ?? data.names.at(-1) ?? id, gameData: { id },
    ...(data.source?.region === 'en' && { localized: true }),
    layout: { manifest: `${artRoot}/layout.json`, artRoot }, terminal: { label: 'Terminal' }, navigation: [] });
  const packNames = Object.keys(data.packs);
  const matchingRooms = Object.entries<ImportedCosmetic>(discovered.backgrounds)
    .filter(([, room]) => packNames.some(pack => Object.hasOwn(room.packs, pack)));
  if (matchingRooms.length === 1) companionRooms.set(id, matchingRooms[0][0]);
}

// Specialized scene and theme exports use the same public interface as regular imports.
for (const { scene, theme, music } of curatedPreviews) {
  const backgroundId = scene.gameData?.id;
  const themeId = theme?.gameData?.id;
  if (backgroundId) backgrounds.set(backgroundId, { scene, ...(music && { music }) });
  if (themeId && theme) {
    themes.set(themeId, theme);
    if (backgroundId) companionRooms.set(themeId, backgroundId);
  }
}

/** Presentation data for a gallery or theme picker. IDs are stable across regions. */
export function homePreviewCatalogue(cosmetics?: GlobalHomeCosmetics) {
  return {
    defaultBackgroundId: discovered.defaultBackgroundId,
    defaultThemeId: discovered.defaultThemeId,
    backgrounds: Array.from(backgrounds, ([id, { scene }]) => ({
      id, title: scene.title, name: cosmetics?.[id]?.name ?? scene.name,
      image: cosmetics?.[id]?.art?.background?.image ?? scene.image, animated: !!scene.native,
    })),
    themes: Array.from(themes, ([id, theme]) => ({
      id, name: cosmetics?.[id]?.name ?? theme.name, backgroundId: companionRooms.get(id) ?? null,
    })),
  };
}

/** Resolve the selected background and optional UI independently of pack or event metadata. */
export function getHomePreview(backgroundId?: string, themeId?: string, cosmetics?: GlobalHomeCosmetics): HomePreview | undefined {
  const room = backgrounds.get(backgroundId ?? discovered.defaultBackgroundId ?? '');
  const theme = themeId === undefined ? undefined : themes.get(themeId);
  if (!room || (themeId !== undefined && !theme)) return;
  const preview = { ...room, ...(theme && { theme }) };
  return withRegionalHomeParts(preview, regionalHomeParts(preview, cosmetics));
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

export function regionalHomeParts(preview: HomePreview, cosmetics: GlobalHomeCosmetics | undefined) {
  return {
    background: cosmetics?.[preview.scene.gameData?.id ?? ''],
    theme: cosmetics?.[preview.theme?.gameData?.id ?? ''],
  };
}

export function withRegionalHomeParts<T extends HomePreview>(preview: T, { background, theme }: ReturnType<typeof regionalHomeParts>): T {
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
