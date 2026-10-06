import type { Appearance } from '@/lib/operators/operatorAppearances';
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

async function bundledIndex(): Promise<DynamicArtIndex> {
  return assertDynamicArtIndex((await import('@/data/dynamic-art.json')).default);
}

/** /skins: every listed outfit's pointer, by skin id. */
export async function withSkinDynamicArt<P extends { skins: Pick<Skin, 'skinId'>[]; dynamicArt?: Record<string, string> }>(props: P): Promise<P> {
  if (props.dynamicArt && typeof props.dynamicArt === 'object') return props;
  return { ...props, dynamicArt: skinDynamicArt(await bundledIndex(), props.skins) };
}

/** /operators/[name]: every artwork's pointer, by appearance label. */
export async function withOperatorDynamicArt<P extends {
  operator: { name: string; internalName?: string | null };
  appearances: Pick<Appearance, 'label' | 'fullPath'>[];
  dynamicArt?: Record<string, string>;
}>(props: P): Promise<P> {
  if (props.dynamicArt && typeof props.dynamicArt === 'object') return props;
  const skins = (await import('@/data/skins.json')).default as Pick<Skin, 'model' | 'name' | 'image' | 'skinId'>[];
  return { ...props, dynamicArt: operatorDynamicArt(await bundledIndex(), props.operator, props.appearances, skins) };
}
