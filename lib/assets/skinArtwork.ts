import { encodeAssetPath, PINNED_ART } from './assetUrl';

const ARTWORK_PATH = /^\/(one|two|three|four|five|six)-star-skins\/(.+)\.webp$/i;
export const SKIN_ARTWORK_WIDTHS = [320, 768, 1280] as const;
type Width = (typeof SKIN_ARTWORK_WIDTHS)[number];

export interface SkinArtworkSources {
  fallback: string;
  original: string;
  avif: Record<Width, string>;
  webp: Record<Width, string>;
}

/** Derive the responsive and lossless URLs while keeping legacy paths valid.
 *  The derived paths carry the filename encoded once (encodeAssetPath), whether
 *  the record held it raw or encoded: they go into a srcset, which splits at
 *  whitespace and commas, and skin names hold both. */
export function getSkinArtworkSources(src: string): SkinArtworkSources | null {
  // A record may name its art in full, pinned to a skin-asset commit (the catalogue
  // externalises new outfits that way); its renditions sit beside it all the same.
  const pinned = src.match(PINNED_ART);
  const match = (pinned?.[1] === 'arkpedia-skin-assets' ? `/${pinned[2]}` : src).match(ARTWORK_PATH);
  if (!match) return null;
  const folder = `${match[1].toLowerCase()}-star-skins`;
  const encodedName = encodeAssetPath(match[2]);
  const rendition = (format: 'avif' | 'webp', width: Width) =>
    `/skin-variants/${format}/w${width}/${folder}/${encodedName}.${format}`;
  return {
    fallback: src,
    original: `/skin-originals/${folder}/${encodedName}.png`,
    avif: { 320: rendition('avif', 320), 768: rendition('avif', 768), 1280: rendition('avif', 1280) },
    webp: { 320: rendition('webp', 320), 768: rendition('webp', 768), 1280: rendition('webp', 1280) },
  };
}

/** One format's `srcset`: each rendition's address (the page's useContentUrl, which
 *  pins it to the content release) and its width descriptor. */
export function skinArtworkSrcSet(renditions: Record<Width, string>, url: (src: string) => string): string {
  return SKIN_ARTWORK_WIDTHS.map((width) => `${url(renditions[width])} ${width}w`).join(', ');
}

export function getSkinArtworkOriginal(src: string): string {
  return getSkinArtworkSources(src)?.original ?? src;
}
