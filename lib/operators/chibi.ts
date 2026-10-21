/** premultipliedAlpha is the SD manifest's word for the pages; the renderer does not trust it and reads
 *  the pages themselves (lib/spine/premultipliedTexture.ts): it was wrong for a third of them. */
export interface ChibiModel { skeleton: string; atlas: string; textures: Record<string, string>; premultipliedAlpha: boolean }
export type ChibiFacings = Partial<Record<'front' | 'back' | 'walk', ChibiModel>>;
