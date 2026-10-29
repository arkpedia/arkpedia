import NextImage, { type ImageProps } from 'next/image';
import { forwardRef, useRef, version as reactVersion, type HTMLAttributes, type ImgHTMLAttributes } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { cssUrl } from '@/lib/content/urls';
import { useAssetUrl } from '@/lib/assets/assetRetry';
import { assetUrl, encodeAssetPath } from '@/lib/assets/assetUrl';

/*
 * Every picture on the site is one of these two, and both wait for the reader
 * (docs/development/ui-primitives.md, "Images load as the reader nears them"): an image
 * is fetched only when it comes within the browser's lazy-load distance of the screen,
 * and decoded off the main thread. The one way to fetch at once is `priority`, which
 * also asks for the image first (fetchpriority="high"): it is for a page's hero, the
 * largest picture above the fold at load (its LCP), and scripts/tests/test-image-loading.ts
 * names every one. Neither component takes a `loading`, so a caller cannot make an image
 * eager any other way, and a page that forgets to say "lazy" gets lazy.
 */

/** next/image, pinned to the page's content release. Lazy unless `priority`. */
const ContentImage = forwardRef<HTMLImageElement, Omit<ImageProps, 'loading'>>(function ContentImage({ src, priority, ...props }, ref) {
  const url = useContentUrl();
  // Next 16 deprecated `priority` for `preload`, and only the newer prop preloads the file;
  // `fetchPriority` stays explicit so the tag still asks for it first, which is what
  // test-image-loading.ts checks and what a browser acts on once the preload is in the head.
  const eager = priority ? { preload: true, fetchPriority: 'high' as const } : {};
  return <NextImage {...props} {...eager} src={typeof src === 'string' ? url(src) : src} ref={ref} />;
});
export default ContentImage;

export type ApplicationAsset = {
  repository: 'arkpedia-image-assets' | 'arkpedia-skin-assets';
  revision: string;
  path: string;
};

/** Code-owned UI artwork, pinned independently of a page's content release. */
export const ApplicationImage = forwardRef<HTMLImageElement, Omit<ImageProps, 'src' | 'loading'> & { asset: ApplicationAsset }>(function ApplicationImage({ asset, priority, ...props }, ref) {
  if (!/^[a-f0-9]{40}$/.test(asset.revision)) throw new Error('Application artwork requires an immutable commit');
  const eager = priority ? { preload: true, fetchPriority: 'high' as const } : {};
  return <NextImage {...props} {...eager} src={assetUrl(asset.repository, asset.revision, encodeAssetPath(asset.path))} ref={ref} />;
});

/** Code-owned monochrome UI art follows ink without adopting a page's content pin. */
export function ApplicationArt({ asset, style, ...props }: HTMLAttributes<HTMLSpanElement> & { asset: ApplicationAsset }) {
  if (!/^[a-f0-9]{40}$/.test(asset.revision)) throw new Error('Application artwork requires an immutable commit');
  const image = cssUrl(assetUrl(asset.repository, asset.revision, encodeAssetPath(asset.path)));
  return <span {...props} style={{ ...style, maskImage: image, WebkitMaskImage: image }} />;
}

/* React 19 knows `fetchPriority`; React 18 warns on a camelCase prop it does not know,
   so there the attribute is written as its lowercase HTML name, as next/image does (its
   getDynamicProps). */
const HIGH_PRIORITY = (Number(reactVersion.split('.')[0]) >= 19 ? { fetchPriority: 'high' } : { fetchpriority: 'high' }) as ImgHTMLAttributes<HTMLImageElement>;

export type ContentImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'loading' | 'decoding' | 'fetchPriority'> & {
  /** The page's hero: the largest picture above the fold at load. Fetched at once and
   *  first. Every other image is lazy, and a `priority` needs its entry in
   *  scripts/tests/test-image-loading.ts. */
  priority?: boolean;
};

/** A native <img>, pinned to the page's content release. Lazy and decoded off the main
 *  thread unless `priority`; the attributes are set after the caller's, so nothing a
 *  caller spreads in can turn that off, and before `src`, so an image put in after
 *  hydration is lazy from the moment it has an address. */
export const ContentImg = forwardRef<HTMLImageElement, ContentImgProps>(function ContentImg({ src, alt, priority = false, ...props }, ref) {
  const url = useContentUrl();
  const loading = priority ? { loading: 'eager' as const, ...HIGH_PRIORITY } : { loading: 'lazy' as const, decoding: 'async' as const };
  const resolved = typeof src === 'string' ? url(src) : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img referrerPolicy={elsewhere(resolved) ? 'no-referrer' : undefined} {...props} {...loading} alt={alt ?? ''} src={resolved} ref={ref} />;
});

/** A picture another site serves (not an arkpedia.net host) is asked for without saying which
 *  page wants it. X's image host answers a request that names another site with an HTML page
 *  (HTTP 351), which the browser blocks, so the official guides hot-linked from it on event pages
 *  (Relaunch Anchor's, 2026-10-29) showed nothing; sent without a referrer it gives the picture. */
function elsewhere(src: unknown): boolean {
  if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) return false;
  try {
    const host = new URL(src).hostname;
    return host !== 'arkpedia.net' && !host.endsWith('.arkpedia.net');
  } catch {
    return false;
  }
}

/** CSS artwork needs the same release pin as ordinary images, and, having no error event,
 *  its own look at a false 404 once it is shown (useAssetUrl, lib/assets/assetRetry.ts). */
export function ContentArt({ src, ownColors = false, style, ...props }: HTMLAttributes<HTMLSpanElement> & { src: string; ownColors?: boolean }) {
  const url = useContentUrl();
  const ref = useRef<HTMLSpanElement>(null);
  const image = cssUrl(useAssetUrl(url(src), ref));
  return <span {...props} ref={ref} style={{ ...style, ...(ownColors ? { backgroundImage: image } : { maskImage: image, WebkitMaskImage: image }) }} />;
}
