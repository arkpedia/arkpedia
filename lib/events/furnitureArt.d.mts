import type { TableRewardGroup } from './tableRewards';
export function furnitureThemeId(group: Pick<TableRewardGroup, 'source' | 'themeId'>): string | null;
export function furnitureArtPath(group: Pick<TableRewardGroup, 'source' | 'themeId'>, isPublished: (file: string) => boolean): string | null;
