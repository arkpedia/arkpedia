import type { Appearance } from '@/lib/operators/operatorAppearances';
import type { PlannedSkin } from '@/lib/pulls/skins';
import { assertDynamicArtIndex, operatorDynamicArt, skinDynamicArt, type DynamicArtIndex } from './dynamicArt';
import type { Skin } from './skinTypes';

/*
 * A page payload's animated-art pointers (dynamicArt), for a release exported before its pages
 * carried them. Right after a deploy the live release is still the one the previous code
 * compiled (scripts/tests/test-previous-release-props.ts), and its /skins and operator pages
 * have no dynamicArt: like withMaterialOrder (lib/content/materialOrderFallback.ts), this
 * deployment's data/dynamic-art.json fills it in, on the server, until the next content run
 * re-exports the page. Pass it as withContentPage's finalize; server-only.
 */

export async function loadDynamicArtIndex(): Promise<DynamicArtIndex> {
  return assertDynamicArtIndex((await import('@/data/dynamic-art.json')).default);
}

/** Keep animation metadata with each outfit wherever its shared dialog is opened.
 * New exports pin it to their release; older releases receive only missing fields. */
export async function withSkinArtwork<S extends Pick<Skin, 'skinId' | 'dynamic' | 'alternate'>>(skins: S[]): Promise<(S & Pick<Skin, 'dynamic' | 'alternate'>)[]> {
  if (skins.every(skin => skin.dynamic !== undefined && skin.alternate !== undefined)) return skins;
  const pointers = skinDynamicArt(await loadDynamicArtIndex(), skins);
  return skins.map(skin => ({ ...skin,
    dynamic: skin.dynamic === undefined ? (skin.skinId ? pointers[skin.skinId] ?? null : null) : skin.dynamic,
    alternate: skin.alternate === undefined ? (skin.skinId ? pointers[`${skin.skinId}^sp_dyn`] ?? null : null) : skin.alternate,
  }));
}

/** /skins: every listed outfit's pointer, by skin id. */
export async function withSkinDynamicArt<P extends { skins: Pick<Skin, 'skinId'>[]; dynamicArt?: Record<string, string> }>(props: P): Promise<P> {
  if (props.dynamicArt && typeof props.dynamicArt === 'object') return props;
  return { ...props, dynamicArt: skinDynamicArt(await loadDynamicArtIndex(), props.skins) };
}

/** /operators/[name]: every artwork's pointer, by appearance label. */
export async function withOperatorDynamicArt<P extends {
  operator: { name: string; internalName?: string | null };
  appearances: Pick<Appearance, 'label' | 'fullPath'>[];
  dynamicArt?: Record<string, string>;
}>(props: P): Promise<P> {
  if (props.dynamicArt && typeof props.dynamicArt === 'object') return props;
  const skins = (await import('@/data/skins.json')).default as Pick<Skin, 'model' | 'name' | 'image' | 'skinId'>[];
  return { ...props, dynamicArt: operatorDynamicArt(await loadDynamicArtIndex(), props.operator, props.appearances, skins) };
}

type PlannerSkinMetadata = Pick<PlannedSkin, 'skinId' | 'dynamic' | 'alternate' | 'searchAliases'> & Partial<Pick<PlannedSkin, 'id'>>;

/** Older planner payloads can omit artwork pointers and former outfit keys. */
export async function withPlannerDynamicArt<P extends { catalogue: PlannerSkinMetadata[] }>(props: P): Promise<P> {
  const pointers = skinDynamicArt(await loadDynamicArtIndex(), props.catalogue);
  const skins = (await import('@/data/skins.json')).default as Skin[];
  const metadata = new Map(skins.map(skin => [skin.skinId, skin]));
  return { ...props, catalogue: props.catalogue.map(skin => {
    const record = skin.skinId ? metadata.get(skin.skinId) : undefined;
    const aliases = skin.searchAliases ?? (record && `${record.model} / ${record.name}` === skin.id ? record.searchAliases : undefined);
    return {
      series: record?.series ?? '', illustrator: record?.illustrator ?? null, description: record?.description ?? null,
      howToObtain: record?.howToObtain ?? null, ...skin, ...(aliases ? { searchAliases: aliases } : {}),
      dynamic: skin.dynamic === undefined ? (skin.skinId ? pointers[skin.skinId] ?? null : null) : skin.dynamic,
      alternate: skin.alternate === undefined ? (skin.skinId ? pointers[`${skin.skinId}^sp_dyn`] ?? null : null) : skin.alternate,
    };
  }) };
}
export async function withPullPlannerDynamicArt<P extends { skinCatalogue: PlannerSkinMetadata[] }>(props: P): Promise<P> {
  const enriched = await withPlannerDynamicArt({ catalogue: props.skinCatalogue });
  return { ...props, skinCatalogue: enriched.catalogue };
}

/** Account and friend galleries also serve older release payloads without animated-art pointers. */
export async function withFriendDynamicArt<P extends { skins: { id: string; dynamic?: string | null; alternate?: string | null }[] }>(props: P): Promise<P> {
  if (props.skins.every(skin => skin.dynamic !== undefined && skin.alternate !== undefined)) return props;
  const pointers = skinDynamicArt(await loadDynamicArtIndex(), props.skins.map(skin => ({ skinId: skin.id })));
  return { ...props, skins: props.skins.map(skin => ({ ...skin,
    dynamic: skin.dynamic === undefined ? pointers[skin.id] ?? null : skin.dynamic,
    alternate: skin.alternate === undefined ? pointers[`${skin.id}^sp_dyn`] ?? null : skin.alternate,
  })) };
}
