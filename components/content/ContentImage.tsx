import NextImage, { type ImageProps } from 'next/image';
import { forwardRef, type HTMLAttributes, type ImgHTMLAttributes } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { cssUrl } from '@/lib/content/urls';

const ContentImage = forwardRef<HTMLImageElement, ImageProps>(function ContentImage({ src, ...props }, ref) {
  const url = useContentUrl();
  return <NextImage {...props} src={typeof src === 'string' ? url(src) : src} ref={ref} />;
});
export default ContentImage;

export const ContentImg = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(function ContentImg({ src, alt, ...props }, ref) {
  const url = useContentUrl();
  // Native images remain native: callers keep their existing loading and sizing.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt ?? ''} src={src ? url(src) : src} ref={ref} />;
});

/** CSS artwork needs the same release pin as ordinary images. */
export function ContentArt({ src, ownColors = false, style, ...props }: HTMLAttributes<HTMLSpanElement> & { src: string; ownColors?: boolean }) {
  const url = useContentUrl();
  const image = cssUrl(url(src));
  return <span {...props} style={{ ...style, ...(ownColors ? { backgroundImage: image } : { maskImage: image, WebkitMaskImage: image }) }} />;
}
