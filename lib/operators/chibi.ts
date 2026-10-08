export interface ChibiModel { skeleton: string; atlas: string; textures: Record<string, string>; premultipliedAlpha: boolean }
export type ChibiFacings = Partial<Record<'front' | 'back' | 'walk', ChibiModel>>;
