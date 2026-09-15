const ARTWORK_PATH = /^\/(one|two|three|four|five|six)-star-skins\/(.+)\.webp$/i;

export interface SkinArtworkSources {
  fallback: string;
  original: string;
  avif: Record<320 | 768 | 1280, string>;
  webp: Record<320 | 768 | 1280, string>;
}

/** Derive the responsive and lossless URLs while keeping legacy paths valid. */
export function getSkinArtworkSources(src: string): SkinArtworkSources | null {
  const match = src.match(ARTWORK_PATH);
  if (!match) return null;
  const folder = `${match[1].toLowerCase()}-star-skins`;
  const encodedName = match[2];
  const rendition = (format: 'avif' | 'webp', width: 320 | 768 | 1280) =>
    `/skin-variants/${format}/w${width}/${folder}/${encodedName}.${format}`;
  return {
    fallback: src,
    original: `/skin-originals/${folder}/${encodedName}.png`,
    avif: { 320: rendition('avif', 320), 768: rendition('avif', 768), 1280: rendition('avif', 1280) },
    webp: { 320: rendition('webp', 320), 768: rendition('webp', 768), 1280: rendition('webp', 1280) },
  };
}

export function getSkinArtworkOriginal(src: string): string {
  return getSkinArtworkSources(src)?.original ?? src;
}
