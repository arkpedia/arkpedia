export function packArtKey(source: string, name: string): string;
export function resolvePackArt(art: Record<string, string>, source: string, name: string): { path: string; layout: 'promo' | 'icon' } | null;
