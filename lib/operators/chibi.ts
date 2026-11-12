/** premultipliedAlpha is the SD manifest's word for the pages; the renderer does not trust it and reads
 *  the pages themselves (lib/spine/premultipliedTexture.ts): it was wrong for a third of them. */
export interface ChibiModel { skeleton: string; atlas: string; textures: Record<string, string>; premultipliedAlpha: boolean }
export type ChibiFacings = Partial<Record<'front' | 'back' | 'walk', ChibiModel>>;

/** A roaming model survives navigation and release changes with its physical URLs. */
export function resolveChibiModel(model: ChibiModel, resolve: (url: string) => string): ChibiModel {
  return { ...model, skeleton: resolve(model.skeleton), atlas: resolve(model.atlas),
    textures: Object.fromEntries(Object.entries(model.textures).map(([name, url]) => [name, resolve(url)])) };
}
export function resolveChibiFacings(models: ChibiFacings, resolve: (url: string) => string): ChibiFacings {
  return Object.fromEntries(Object.entries(models).map(([facing, model]) => [facing, resolveChibiModel(model, resolve)]));
}
